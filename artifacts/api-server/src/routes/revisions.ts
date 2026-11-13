import { Router, type IRouter } from "express";
import { supabase } from "../lib/supabase.js";

const router: IRouter = Router();

router.get("/revisions", async (req, res) => {
  try {
    const { orderId } = req.query as Record<string, string>;
    const userId = req.headers["x-user-id"] as string;
    const userRole = req.headers["x-user-role"] as string;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    let query = supabase
      .from("revisions")
      .select("*")
      .order("created_at", { ascending: false });

    if (orderId) {
      // try matching by UUID or display ID
      const isUUID = /^[0-9a-f-]{36}$/.test(orderId);
      if (isUUID) {
        query = query.or(`order_id.eq.${orderId},order_display_id.eq.${orderId}`);
      } else {
        query = query.eq("order_display_id", orderId);
      }
    }

    if (userRole === "student") {
      query = query.eq("student_id", userId);
    } else if (userRole === "admin") {
      query = query.eq("assigned_admin_id", userId);
    }
    // superadmin sees all

    const { data, error } = await query;
    if (error) throw error;

    res.json(data?.map(mapRevision) || []);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/revisions", async (req, res) => {
  try {
    const { orderId, description, fileUrl } = req.body;
    const userId = req.headers["x-user-id"] as string;
    const userRole = req.headers["x-user-role"] as string;

    if (userRole !== "student") {
      res.status(403).json({ error: "Only students can submit revision requests" });
      return;
    }

    if (!description?.trim()) {
      res.status(400).json({ error: "Description is required" });
      return;
    }

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, order_id, assigned_admin_id, assigned_admin_name, student_id, status, revision_count")
      .or(`id.eq.${orderId},order_id.eq.${orderId}`)
      .single();

    if (orderErr || !order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (order.student_id !== userId) {
      res.status(403).json({ error: "You can only request revisions for your own orders" });
      return;
    }

    // Must have balance paid (ready_for_download) or already under revision review
    const revisionableStatuses = ["ready_for_download", "under_review", "closed"];
    if (!revisionableStatuses.includes(order.status)) {
      res.status(400).json({ error: `Revisions can only be requested after you have paid the balance and the order is ready for download. Current status: ${order.status.replace(/_/g, " ")}` });
      return;
    }

    const { data, error } = await supabase
      .from("revisions")
      .insert({
        order_id: order.id,
        order_display_id: order.order_id,
        student_id: userId,
        assigned_admin_id: order.assigned_admin_id || null,
        assigned_admin_name: order.assigned_admin_name || null,
        description: description.trim(),
        file_url: fileUrl || null,
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    // Update order status and increment revision_count
    const newCount = (Number(order.revision_count) || 0) + 1;
    await supabase
      .from("orders")
      .update({
        status: "under_review",
        revision_count: newCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    res.status(201).json(mapRevision(data));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/revisions/:revisionId/corrected-download-url", async (req, res) => {
  try {
    const { revisionId } = req.params;
    const userId = req.headers["x-user-id"] as string;
    const userRole = req.headers["x-user-role"] as string;

    const { data: revision } = await supabase
      .from("revisions")
      .select("id, student_id, assigned_admin_id, corrected_file_storage_path, status")
      .eq("id", revisionId)
      .single();

    if (!revision) { res.status(404).json({ error: "Revision not found" }); return; }
    if (userRole === "student" && revision.student_id !== userId) {
      res.status(403).json({ error: "Access denied" }); return;
    }
    if (userRole === "admin" && revision.assigned_admin_id && revision.assigned_admin_id !== userId) {
      res.status(403).json({ error: "Access denied" }); return;
    }
    if (!revision.corrected_file_storage_path) {
      res.status(404).json({ error: "No uploaded file for this revision" }); return;
    }

    const { data: signedData, error } = await supabase.storage
      .from("revisions")
      .createSignedUrl(revision.corrected_file_storage_path as string, 300);

    if (error || !signedData) {
      res.status(500).json({ error: error?.message || "Failed to create download URL" }); return;
    }
    res.json({ url: signedData.signedUrl });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/revisions/:revisionId/respond", async (req, res) => {
  try {
    const { revisionId } = req.params;
    const { adminResponse, correctedFileUrl, correctedFileLink, correctedFileStoragePath, status } = req.body;
    const userId = req.headers["x-user-id"] as string;
    const userRole = req.headers["x-user-role"] as string;

    if (userRole !== "admin" && userRole !== "superadmin") {
      res.status(403).json({ error: "Only admins can respond to revisions" });
      return;
    }

    if (userRole === "admin") {
      const { data: existing } = await supabase
        .from("revisions")
        .select("assigned_admin_id")
        .eq("id", revisionId)
        .single();

      if (existing && existing.assigned_admin_id && existing.assigned_admin_id !== userId) {
        res.status(403).json({ error: "You can only respond to revisions for your orders" });
        return;
      }
    }

    const { data, error } = await supabase
      .from("revisions")
      .update({
        admin_response: adminResponse,
        corrected_file_url: correctedFileUrl || null,
        corrected_file_link: correctedFileLink || null,
        corrected_file_storage_path: correctedFileStoragePath || null,
        status: status || "resolved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", revisionId)
      .select()
      .single();

    if (error) throw error;

    // After resolving revision, set order back to completed/ready_for_download
    if (data?.order_id && (status === "resolved" || !status)) {
      const { data: orderData } = await supabase
        .from("orders")
        .select("deposit_paid, balance_paid, payment_option")
        .eq("id", data.order_id)
        .single();

      const resolvedStatus = "ready_for_download";

      await supabase
        .from("orders")
        .update({ status: resolvedStatus, updated_at: new Date().toISOString() })
        .eq("id", data.order_id);
    }

    res.json(mapRevision(data));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// PATCH: allow researcher to edit resolved revision response (url/message)
router.patch("/revisions/:revisionId", async (req, res) => {
  try {
    const { revisionId } = req.params;
    const { adminResponse, correctedFileUrl, correctedFileLink } = req.body;
    const userId = req.headers["x-user-id"] as string;
    const userRole = req.headers["x-user-role"] as string;

    if (userRole !== "admin" && userRole !== "superadmin") {
      res.status(403).json({ error: "Only admins can edit revision responses" });
      return;
    }

    if (userRole === "admin") {
      const { data: existing } = await supabase
        .from("revisions")
        .select("assigned_admin_id")
        .eq("id", revisionId)
        .single();

      if (existing?.assigned_admin_id && existing.assigned_admin_id !== userId) {
        res.status(403).json({ error: "You can only edit your own revision responses" });
        return;
      }
    }

    const { correctedFileStoragePath: patchStoragePath } = req.body as { correctedFileStoragePath?: string };
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (adminResponse !== undefined) updates.admin_response = adminResponse;
    if (correctedFileUrl !== undefined) updates.corrected_file_url = correctedFileUrl || null;
    if (correctedFileLink !== undefined) updates.corrected_file_link = correctedFileLink || null;
    if (patchStoragePath !== undefined) updates.corrected_file_storage_path = patchStoragePath || null;

    const { data, error } = await supabase
      .from("revisions")
      .update(updates)
      .eq("id", revisionId)
      .select()
      .single();

    if (error) throw error;
    res.json(mapRevision(data));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

function mapRevision(row: Record<string, unknown>) {
  return {
    id: row.id,
    orderId: row.order_id,
    orderDisplayId: row.order_display_id,
    studentId: row.student_id,
    assignedAdminId: row.assigned_admin_id,
    assignedAdminName: row.assigned_admin_name,
    description: row.description,
    fileUrl: row.file_url,
    status: row.status,
    adminResponse: row.admin_response,
    correctedFileUrl: row.corrected_file_url,
    correctedFileLink: row.corrected_file_link,
    correctedFileStoragePath: row.corrected_file_storage_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default router;
