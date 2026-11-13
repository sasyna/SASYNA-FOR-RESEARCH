import { Router, type IRouter } from "express";
import { supabase } from "../lib/supabase.js";
import { generateOrderId } from "../lib/orderUtils.js";

function extractError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    if (typeof e.message === "string") return e.message;
    if (typeof e.error === "string") return e.error;
    return JSON.stringify(err);
  }
  return String(err);
}

const router: IRouter = Router();

// ─── Pricing ────────────────────────────────────────────────────────────────

router.get("/pricing", async (req, res) => {
  const { level } = req.query as { level?: string };
  try {
    if (level) {
      const { data } = await supabase
        .from("level_pricing")
        .select("*")
        .eq("level", level)
        .maybeSingle();
      if (data) {
        res.json({
          researchProposalPrice: Number(data.research_proposal_price) || 0,
          researchDissertationPrice: Number(data.research_project_price) || 0,
          completeResearchProjectPrice: Number(data.complete_research_project_price) || 0,
          depositPercentage: Number(data.deposit_percentage),
          level: data.level,
        });
        return;
      }
    }
    const { data: cfg } = await supabase.from("pricing_config").select("*").maybeSingle();
    res.json({
      researchProposalPrice: Number(cfg?.research_proposal_price) || 1500,
      researchDissertationPrice: Number(cfg?.research_project_price) || 1500,
      completeResearchProjectPrice: Number(cfg?.complete_research_project_price) || 2500,
      depositPercentage: Number(cfg?.deposit_percentage) || 50,
    });
  } catch {
    res.json({ researchProposalPrice: 1500, researchDissertationPrice: 1500, completeResearchProjectPrice: 2500, depositPercentage: 50 });
  }
});

router.get("/pricing/levels", async (_req, res) => {
  try {
    const { data } = await supabase.from("level_pricing").select("*").order("level");
    res.json(data || []);
  } catch {
    res.json([]);
  }
});

// ─── Proposal Upload (get signed upload URL) ─────────────────────────────────

router.post("/orders/proposal-upload-url", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    const userRole = req.headers["x-user-role"] as string;

    if (!userId || userRole !== "student") {
      res.status(403).json({ error: "Only students can upload proposals" });
      return;
    }

    const { filename } = req.body as { filename: string };
    if (!filename) {
      res.status(400).json({ error: "filename is required" });
      return;
    }

    const ext = filename.split(".").pop() || "pdf";
    const filePath = `${userId}/${Date.now()}.${ext}`;

    const { data, error } = await supabase.storage
      .from("proposals")
      .createSignedUploadUrl(filePath);

    if (error || !data) {
      res.status(500).json({ error: error?.message || "Failed to create upload URL" });
      return;
    }

    res.json({ signedUrl: data.signedUrl, path: filePath, token: data.token });
  } catch (err: unknown) {
    const msg = extractError(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Proposal Download (get signed download URL for admin) ───────────────────

router.get("/orders/:orderId/proposal-download-url", async (req, res) => {
  try {
    const { orderId } = req.params;
    const userRole = req.headers["x-user-role"] as string;

    if (userRole !== "admin" && userRole !== "superadmin") {
      res.status(403).json({ error: "Only admins can access proposal downloads" });
      return;
    }

    const { data: order } = await supabase
      .from("orders")
      .select("uploaded_file_url, uploaded_file_name")
      .or(`id.eq.${orderId},order_id.eq.${orderId}`)
      .single();

    if (!order?.uploaded_file_url) {
      res.status(404).json({ error: "No proposal uploaded for this order" });
      return;
    }

    const filePath = order.uploaded_file_url;

    const { data, error } = await supabase.storage
      .from("proposals")
      .createSignedUrl(filePath, 3600);

    if (error || !data) {
      res.status(500).json({ error: error?.message || "Failed to create download URL" });
      return;
    }

    res.json({ signedUrl: data.signedUrl, filename: order.uploaded_file_name || "proposal.pdf" });
  } catch (err: unknown) {
    const msg = extractError(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Completed Work Upload URL (admin) ───────────────────────────────────────

router.post("/orders/:orderId/completed-upload-url", async (req, res) => {
  try {
    const userRole = req.headers["x-user-role"] as string;
    if (userRole !== "admin" && userRole !== "superadmin") {
      res.status(403).json({ error: "Only admins can upload completed work" });
      return;
    }
    const { orderId } = req.params;
    const { filename } = req.body as { filename: string };
    if (!filename) { res.status(400).json({ error: "filename is required" }); return; }

    const { data: order } = await supabase
      .from("orders")
      .select("id")
      .or(`id.eq.${orderId},order_id.eq.${orderId}`)
      .single();
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }

    const ext = filename.split(".").pop() || "pdf";
    const filePath = `${order.id}/${Date.now()}.${ext}`;

    const { data, error } = await supabase.storage
      .from("completed-work")
      .createSignedUploadUrl(filePath);
    if (error || !data) {
      res.status(500).json({ error: error?.message || "Failed to create upload URL" });
      return;
    }
    res.json({ signedUrl: data.signedUrl, path: filePath, token: data.token });
  } catch (err: unknown) {
    res.status(500).json({ error: extractError(err) });
  }
});

// ─── Save Completed Work Storage Path (admin) ─────────────────────────────────

router.patch("/orders/:orderId/completed-file", async (req, res) => {
  try {
    const userRole = req.headers["x-user-role"] as string;
    if (userRole !== "admin" && userRole !== "superadmin") {
      res.status(403).json({ error: "Only admins can save completed work" });
      return;
    }
    const { orderId } = req.params;
    const { storagePath } = req.body as { storagePath: string };
    if (!storagePath) { res.status(400).json({ error: "storagePath is required" }); return; }

    // Fetch payment state to determine the correct post-completion status
    const { data: existing } = await supabase
      .from("orders")
      .select("id, balance_paid, payment_option, deposit_paid, assigned_admin_id, admin_share, total_amount, deposit_amount")
      .or(`id.eq.${orderId},order_id.eq.${orderId}`)
      .single();
    if (!existing) { res.status(404).json({ error: "Order not found" }); return; }

    const isPrepaidFull =
      (existing.payment_option === "full" && existing.deposit_paid) ||
      existing.balance_paid;
    const newStatus = isPrepaidFull ? "ready_for_download" : "awaiting_balance";

    const { data, error } = await supabase
      .from("orders")
      .update({
        completed_file_storage_path: storagePath,
        completed_file_url: null,
        completed_file_link: null,
        status: newStatus,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .or(`id.eq.${orderId},order_id.eq.${orderId}`)
      .select()
      .single();
    if (error) throw error;

    // Credit admin wallet (same logic as /complete)
    if (existing.assigned_admin_id) {
      const adminId = existing.assigned_admin_id as string;
      const adminShare = Number(existing.admin_share) || Number(existing.total_amount) * 0.5;
      if (adminShare > 0) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("pending_wallet, wallet_balance")
          .eq("id", adminId)
          .single();
        const currentPending = Number(profile?.pending_wallet) || 0;
        const currentBalance = Number(profile?.wallet_balance) || 0;
        const totalAmt = Number(existing.total_amount) || 0;
        const depositAmt = Number(existing.deposit_amount) || totalAmt * 0.5;
        const balanceAmt = totalAmt - depositAmt;
        const depositCredit = depositAmt * 0.5;
        const pendingDeduction = Math.min(currentPending, depositCredit);
        await supabase
          .from("profiles")
          .update({
            pending_wallet: Math.max(0, currentPending - pendingDeduction),
            wallet_balance: currentBalance + (isPrepaidFull ? depositCredit + balanceAmt * 0.5 : depositCredit),
            updated_at: new Date().toISOString(),
          })
          .eq("id", adminId);
      }
    }

    res.json(mapOrder(data));
  } catch (err: unknown) {
    res.status(500).json({ error: extractError(err) });
  }
});

// ─── Delete Completed Work (admin) ────────────────────────────────────────────

router.delete("/orders/:orderId/completed-file", async (req, res) => {
  try {
    const userRole = req.headers["x-user-role"] as string;
    if (userRole !== "admin" && userRole !== "superadmin") {
      res.status(403).json({ error: "Only admins can delete completed work" });
      return;
    }
    const { orderId } = req.params;

    const { data: order } = await supabase
      .from("orders")
      .select("id, completed_file_storage_path")
      .or(`id.eq.${orderId},order_id.eq.${orderId}`)
      .single();
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }

    // Remove from Supabase Storage bucket
    if (order.completed_file_storage_path) {
      const { error: storageErr } = await supabase.storage
        .from("completed-work")
        .remove([order.completed_file_storage_path as string]);
      if (storageErr) {
        console.error("Storage delete error:", storageErr.message);
      }
    }

    // Clear DB fields and revert status so the researcher can re-upload
    const { data, error } = await supabase
      .from("orders")
      .update({
        completed_file_storage_path: null,
        completed_file_url: null,
        completed_file_link: null,
        status: "in_progress",
        completed_at: null,
        updated_at: new Date().toISOString(),
      })
      .or(`id.eq.${orderId},order_id.eq.${orderId}`)
      .select()
      .single();
    if (error) throw error;
    res.json(mapOrder(data));
  } catch (err: unknown) {
    res.status(500).json({ error: extractError(err) });
  }
});

// ─── Completed Work Download URL (student/admin) ──────────────────────────────

router.get("/orders/:orderId/completed-download-url", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    const userRole = req.headers["x-user-role"] as string;
    const { orderId } = req.params;

    const { data: order } = await supabase
      .from("orders")
      .select("id, student_id, status, completed_file_storage_path, balance_paid, payment_option, deposit_paid")
      .or(`id.eq.${orderId},order_id.eq.${orderId}`)
      .single();

    if (!order) { res.status(404).json({ error: "Order not found" }); return; }

    if (userRole === "student") {
      if (order.student_id !== userId) { res.status(403).json({ error: "Access denied" }); return; }
      if (order.status !== "ready_for_download") {
        res.status(403).json({ error: "File not yet available for download" }); return;
      }
      // Ensure balance is fully paid before granting download access
      const fullyPaid =
        order.balance_paid ||
        (order.payment_option === "full" && order.deposit_paid);
      if (!fullyPaid) {
        res.status(403).json({ error: "Please complete your balance payment to download this file" }); return;
      }
    } else if (userRole !== "admin" && userRole !== "superadmin") {
      res.status(403).json({ error: "Access denied" }); return;
    }

    if (!order.completed_file_storage_path) {
      res.status(404).json({ error: "No file uploaded for this order" }); return;
    }

    const { data, error } = await supabase.storage
      .from("completed-work")
      .createSignedUrl(order.completed_file_storage_path as string, 3600);
    if (error || !data) {
      res.status(500).json({ error: error?.message || "Failed to create download URL" }); return;
    }
    res.json({ signedUrl: data.signedUrl });
  } catch (err: unknown) {
    res.status(500).json({ error: extractError(err) });
  }
});

// ─── Orders ──────────────────────────────────────────────────────────────────

router.get("/orders", async (req, res) => {
  try {
    const { status, assignedTo } = req.query as Record<string, string>;
    const userId = req.headers["x-user-id"] as string;
    const userRole = req.headers["x-user-role"] as string;

    let query = supabase.from("orders").select("*").order("created_at", { ascending: false });

    if (userRole === "student") {
      query = query.eq("student_id", userId);
    } else if (userRole === "admin") {
      query = query.eq("assigned_admin_id", userId);
    }

    if (status) query = query.eq("status", status);
    if (assignedTo) query = query.eq("assigned_admin_id", assignedTo);

    const { data, error } = await query;
    if (error) throw error;

    res.json(data?.map(mapOrder) || []);
  } catch (err: unknown) {
    const msg = extractError(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/orders", async (req, res) => {
  try {
    const body = req.body;
    const userId = req.headers["x-user-id"] as string;

    const orderId = generateOrderId();
    const totalAmount = Number(body.totalAmount) || 0;
    const depositPct = Number(body.depositPercentage) || 50;
    const depositAmount = body.paymentOption === "full" ? totalAmount : totalAmount * (depositPct / 100);

    const { data, error } = await supabase
      .from("orders")
      .insert({
        order_id: orderId,
        student_id: userId,
        student_name: body.studentName,
        student_email: body.studentEmail,
        student_phone_number: body.studentPhoneNumber || null,
        department: body.department,
        course_name: body.courseName,
        level_of_study: body.levelOfStudy,
        service_type: body.serviceType,
        research_topic: body.researchTopic,
        research_objectives: body.researchObjectives,
        additional_instructions: body.additionalInstructions,
        uploaded_file_url: body.uploadedFileUrl || null,
        uploaded_file_name: body.uploadedFileName || null,
        status: "pending_payment",
        deposit_paid: false,
        balance_paid: false,
        payment_option: body.paymentOption || "deposit",
        total_amount: totalAmount,
        deposit_amount: depositAmount,
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(mapOrder(data));
  } catch (err: unknown) {
    const msg = extractError(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/orders/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.headers["x-user-id"] as string;
    const userRole = req.headers["x-user-role"] as string;

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .or(`id.eq.${orderId},order_id.eq.${orderId}`)
      .single();

    if (error || !data) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (userRole === "student" && data.student_id !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    res.json(mapOrder(data));
  } catch (err: unknown) {
    const msg = extractError(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/students/:studentId/orders", async (req, res) => {
  try {
    const { studentId } = req.params;
    const userRole = req.headers["x-user-role"] as string;

    if (userRole !== "admin" && userRole !== "superadmin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data?.map(mapOrder) || []);
  } catch (err: unknown) {
    const msg = extractError(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/orders/:orderId/claim", async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.headers["x-user-id"] as string;
    const userRole = req.headers["x-user-role"] as string;

    if (userRole !== "admin" && userRole !== "superadmin") {
      res.status(403).json({ error: "Only admins can claim orders" });
      return;
    }

    const { data: activeOrders } = await supabase
      .from("orders")
      .select("id")
      .eq("assigned_admin_id", userId)
      .in("status", ["assigned", "in_progress", "under_review"]);

    if (activeOrders && activeOrders.length > 0) {
      res.status(400).json({
        error: "You must complete your current active order before claiming a new one.",
      });
      return;
    }

    const { data: pendingRevisions } = await supabase
      .from("revisions")
      .select("id")
      .eq("assigned_admin_id", userId)
      .eq("status", "pending");

    if (pendingRevisions && pendingRevisions.length > 0) {
      res.status(400).json({
        error: "You have pending revision requests that must be resolved before claiming a new order.",
      });
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, pending_wallet")
      .eq("id", userId)
      .single();

    const { data: orderData } = await supabase
      .from("orders")
      .select("total_amount, deposit_amount, student_id, student_name")
      .or(`id.eq.${orderId},order_id.eq.${orderId}`)
      .single();

    const totalAmount = Number(orderData?.total_amount) || 0;
    const adminShare = totalAmount * 0.5;
    const depositAmount = Number(orderData?.deposit_amount) || totalAmount * 0.5;
    const pendingCredit = depositAmount * 0.5;

    const { data, error } = await supabase
      .from("orders")
      .update({
        assigned_admin_id: userId,
        assigned_admin_name: profile?.full_name || "Admin",
        status: "assigned",
        admin_share: adminShare,
        updated_at: new Date().toISOString(),
      })
      .or(`id.eq.${orderId},order_id.eq.${orderId}`)
      .eq("status", "pending_assignment")
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      res.status(400).json({ error: "Order cannot be claimed (may already be assigned)" });
      return;
    }

    if (pendingCredit > 0) {
      const currentPending = Number(profile?.pending_wallet) || 0;
      await supabase
        .from("profiles")
        .update({
          pending_wallet: currentPending + pendingCredit,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
    }

    res.json({ ...mapOrder(data), studentHistory: [] });
  } catch (err: unknown) {
    const msg = extractError(err);
    res.status(500).json({ error: msg });
  }
});

router.patch("/orders/:orderId/status", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    const userRole = req.headers["x-user-role"] as string;

    if (userRole !== "admin" && userRole !== "superadmin") {
      res.status(403).json({ error: "Only admins can update status" });
      return;
    }

    const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };

    const { data, error } = await supabase
      .from("orders")
      .update(updates)
      .or(`id.eq.${orderId},order_id.eq.${orderId}`)
      .select()
      .single();

    if (error) throw error;
    res.json(mapOrder(data));
  } catch (err: unknown) {
    const msg = extractError(err);
    res.status(500).json({ error: msg });
  }
});

router.patch("/orders/:orderId/url", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { fileUrl, fileLink } = req.body;
    const userRole = req.headers["x-user-role"] as string;

    if (userRole !== "admin" && userRole !== "superadmin") {
      res.status(403).json({ error: "Only admins can update order URL" });
      return;
    }

    const { data, error } = await supabase
      .from("orders")
      .update({
        completed_file_url: fileUrl || null,
        completed_file_link: fileLink || null,
        updated_at: new Date().toISOString(),
      })
      .or(`id.eq.${orderId},order_id.eq.${orderId}`)
      .select()
      .single();

    if (error) throw error;
    res.json(mapOrder(data));
  } catch (err: unknown) {
    const msg = extractError(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/orders/:orderId/complete", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { fileUrl, fileLink } = req.body;
    const userRole = req.headers["x-user-role"] as string;

    if (userRole !== "admin" && userRole !== "superadmin") {
      res.status(403).json({ error: "Only admins can complete orders" });
      return;
    }

    if (!fileUrl && !fileLink) {
      res.status(400).json({ error: "A document URL is required before marking an order as complete." });
      return;
    }

    const { data: existing } = await supabase
      .from("orders")
      .select("id, deposit_paid, balance_paid, payment_option, assigned_admin_id, admin_share, total_amount, deposit_amount")
      .or(`id.eq.${orderId},order_id.eq.${orderId}`)
      .single();

    const isPrepaidFull = (existing?.payment_option === "full" && existing?.deposit_paid) || existing?.balance_paid;
    const newStatus = isPrepaidFull ? "ready_for_download" : "awaiting_balance";

    const { data, error } = await supabase
      .from("orders")
      .update({
        completed_file_url: fileUrl,
        completed_file_link: fileLink,
        status: newStatus,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .or(`id.eq.${orderId},order_id.eq.${orderId}`)
      .select()
      .single();

    if (error) throw error;

    if (existing?.assigned_admin_id) {
      const adminId = existing.assigned_admin_id as string;
      const adminShare = Number(existing.admin_share) || Number(existing.total_amount) * 0.5;
      if (adminShare > 0) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("pending_wallet, wallet_balance")
          .eq("id", adminId)
          .single();
        const currentPending = Number(profile?.pending_wallet) || 0;
        const currentBalance = Number(profile?.wallet_balance) || 0;
        const totalAmt = Number(existing.total_amount) || 0;
        const depositAmt = Number(existing.deposit_amount) || totalAmt * 0.5;
        const balanceAmt = totalAmt - depositAmt;
        const depositCredit = depositAmt * 0.5;
        const pendingDeduction = Math.min(currentPending, depositCredit);
        const newPending = Math.max(0, currentPending - pendingDeduction);
        const balanceCredit = isPrepaidFull ? depositCredit + balanceAmt * 0.5 : depositCredit;
        await supabase
          .from("profiles")
          .update({
            pending_wallet: newPending,
            wallet_balance: currentBalance + balanceCredit,
            updated_at: new Date().toISOString(),
          })
          .eq("id", adminId);
      }
    }

    res.json(mapOrder(data));
  } catch (err: unknown) {
    const msg = extractError(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/orders/:orderId/refund", async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.headers["x-user-id"] as string;
    const userRole = req.headers["x-user-role"] as string;

    if (userRole !== "student") {
      res.status(403).json({ error: "Only students can request refunds" });
      return;
    }

    const { data: order } = await supabase
      .from("orders")
      .select("*")
      .or(`id.eq.${orderId},order_id.eq.${orderId}`)
      .eq("student_id", userId)
      .single();

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (order.assigned_admin_id) {
      res.status(400).json({ error: "Refund not available after order is assigned" });
      return;
    }

    const { data, error } = await supabase
      .from("orders")
      .update({ status: "refund_requested", updated_at: new Date().toISOString() })
      .or(`id.eq.${orderId},order_id.eq.${orderId}`)
      .select()
      .single();

    if (error) throw error;
    res.json(mapOrder(data));
  } catch (err: unknown) {
    const msg = extractError(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/orders/:orderId/approve-refund", async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.headers["x-user-id"] as string;
    const userRole = req.headers["x-user-role"] as string;

    if (userRole !== "superadmin") {
      res.status(403).json({ error: "Only super admins can approve refunds" });
      return;
    }

    const { data, error } = await supabase
      .from("orders")
      .update({ status: "refunded", updated_at: new Date().toISOString() })
      .or(`id.eq.${orderId},order_id.eq.${orderId}`)
      .eq("status", "refund_requested")
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      res.status(400).json({ error: "Order not found or not in refund_requested state" });
      return;
    }

    const { data: orderPayments } = await supabase
      .from("payments")
      .select("amount")
      .or(`order_id.eq.${data.id},order_id.eq.${data.order_id}`)
      .eq("status", "success");
    const refundAmount = (orderPayments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const { data: approver } = await supabase.from("profiles").select("full_name").eq("id", userId).single();
    try {
      await supabase.from("refund_history").insert({
        order_id: data.id,
        order_display_id: data.order_id,
        student_id: data.student_id,
        student_name: data.student_name,
        student_email: data.student_email,
        amount: refundAmount,
        approved_by: userId,
        approved_by_name: approver?.full_name || "Super Admin",
        created_at: new Date().toISOString(),
      });
    } catch { }

    res.json(mapOrder(data));
  } catch (err: unknown) {
    const msg = extractError(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/orders/:orderId/reject-refund", async (req, res) => {
  try {
    const { orderId } = req.params;
    const userRole = req.headers["x-user-role"] as string;

    if (userRole !== "superadmin") {
      res.status(403).json({ error: "Only super admins can reject refunds" });
      return;
    }

    const { data, error } = await supabase
      .from("orders")
      .update({ status: "pending_assignment", updated_at: new Date().toISOString() })
      .or(`id.eq.${orderId},order_id.eq.${orderId}`)
      .eq("status", "refund_requested")
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      res.status(400).json({ error: "Order not found or not in refund_requested state" });
      return;
    }
    res.json(mapOrder(data));
  } catch (err: unknown) {
    const msg = extractError(err);
    res.status(500).json({ error: msg });
  }
});

function mapOrder(row: Record<string, unknown>) {
  return {
    id: row.id,
    orderId: row.order_id,
    studentId: row.student_id,
    studentName: row.student_name,
    studentEmail: row.student_email,
    studentPhoneNumber: row.student_phone_number,
    department: row.department,
    courseName: row.course_name,
    levelOfStudy: row.level_of_study,
    serviceType: row.service_type,
    researchTopic: row.research_topic,
    researchObjectives: row.research_objectives,
    additionalInstructions: row.additional_instructions,
    uploadedFileUrl: row.uploaded_file_url,
    uploadedFileName: row.uploaded_file_name,
    status: row.status,
    paymentOption: row.payment_option,
    assignedAdminId: row.assigned_admin_id,
    assignedAdminName: row.assigned_admin_name,
    depositAmount: row.deposit_amount,
    totalAmount: row.total_amount,
    depositPaid: row.deposit_paid,
    balancePaid: row.balance_paid,
    depositReference: row.deposit_reference,
    balanceReference: row.balance_reference,
    completedFileStoragePath: row.completed_file_storage_path,
    completedFileUrl: row.completed_file_url,
    completedFileLink: row.completed_file_link,
    revisedFileUrl: row.revised_file_url,
    revisedFileLink: row.revised_file_link,
    adminShare: row.admin_share,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default router;
