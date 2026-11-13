import { Router } from "express";
import { supabase } from "../lib/supabase.js";

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as Record<string, unknown>).message);
  return String(err);
}

const router = Router();

router.get("/notifications", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    const userRole = req.headers["x-user-role"] as string;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    let query = supabase
      .from("notifications")
      .select("*")
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(50);

    if (userRole === "superadmin") {
      query = query.or(`sender_id.eq.${userId},recipient_id.eq.${userId},is_public.eq.true`);
    } else if (userRole === "admin") {
      query = query.or(`sender_id.eq.${userId},recipient_id.eq.${userId},is_public.eq.true`);
    } else {
      query = query.or(`recipient_id.eq.${userId},is_public.eq.true`);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json(data?.map(mapNotification) || []);
  } catch (err: unknown) {
    const msg = errMsg(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/notifications/unread-count", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] as string;

    if (!userId) {
      res.json({ count: 0 });
      return;
    }

    const { data, error } = await supabase
      .from("notifications")
      .select("id")
      .eq("is_read", false)
      .eq("is_deleted", false)
      .or(`recipient_id.eq.${userId},is_public.eq.true`);

    if (error) throw error;

    res.json({ count: data?.length || 0 });
  } catch {
    res.json({ count: 0 });
  }
});

router.post("/notifications/send", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    const userRole = req.headers["x-user-role"] as string;
    const userName = req.headers["x-user-name"] as string;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { recipientEmail, recipientId, title, message, isPublic, displayName } = req.body as {
      recipientEmail?: string;
      recipientId?: string;
      title: string;
      message: string;
      isPublic?: boolean;
      displayName?: string;
    };

    if (!title?.trim() || !message?.trim()) {
      res.status(400).json({ error: "Title and message are required" });
      return;
    }

    let finalRecipientId: string | null = recipientId || null;
    let recipientEmailResolved: string | null = null;

    if (recipientEmail && !isPublic) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, email")
        .eq("email", recipientEmail)
        .maybeSingle();

      if (!profile) {
        res.status(404).json({ error: "No user found with that email address" });
        return;
      }
      finalRecipientId = profile.id;
      recipientEmailResolved = profile.email;
    }

    if (userRole === "admin" && !isPublic) {
      if (!finalRecipientId) {
        res.status(400).json({ error: "Recipient is required" });
        return;
      }
      const { data: activeOrder } = await supabase
        .from("orders")
        .select("id")
        .eq("assigned_admin_id", userId)
        .eq("student_id", finalRecipientId)
        .in("status", ["assigned", "in_progress", "under_review", "completed", "awaiting_balance", "ready_for_download"])
        .limit(1)
        .maybeSingle();

      if (!activeOrder) {
        res.status(403).json({ error: "You can only notify students whose orders you are handling" });
        return;
      }
    }

    // Use displayName if provided, otherwise fall back to profile name
    const senderName = displayName?.trim() || userName || "System";

    const insertData: Record<string, unknown> = {
      sender_id: userId,
      sender_name: senderName,
      sender_role: userRole,
      title: title.trim(),
      message: message.trim(),
      is_public: isPublic ? true : false,
      is_read: false,
      is_deleted: false,
      created_at: new Date().toISOString(),
    };

    if (!isPublic && finalRecipientId) {
      insertData.recipient_id = finalRecipientId;
      insertData.recipient_email = recipientEmailResolved;
    }

    const { data, error } = await supabase
      .from("notifications")
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(mapNotification(data));
  } catch (err: unknown) {
    const msg = errMsg(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/notifications/:id/read", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.headers["x-user-id"] as string;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id);

    res.json({ success: true });
  } catch (err: unknown) {
    const msg = errMsg(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/notifications/mark-all-read", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] as string;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("is_deleted", false)
      .or(`recipient_id.eq.${userId},is_public.eq.true`);

    res.json({ success: true });
  } catch (err: unknown) {
    const msg = errMsg(err);
    res.status(500).json({ error: msg });
  }
});

// Delete a notification (soft delete) — superadmin can delete any; admin can delete their own sent notifications
router.delete("/notifications/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.headers["x-user-id"] as string;
    const userRole = req.headers["x-user-role"] as string;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (userRole === "superadmin") {
      await supabase
        .from("notifications")
        .update({ is_deleted: true })
        .eq("id", id);
    } else if (userRole === "admin") {
      // Admin can only delete notifications they sent
      const { data: notif } = await supabase
        .from("notifications")
        .select("sender_id")
        .eq("id", id)
        .single();

      if (!notif || notif.sender_id !== userId) {
        res.status(403).json({ error: "You can only delete notifications you sent" });
        return;
      }

      await supabase
        .from("notifications")
        .update({ is_deleted: true })
        .eq("id", id);
    } else {
      res.status(403).json({ error: "You do not have permission to delete notifications" });
      return;
    }

    res.json({ success: true });
  } catch (err: unknown) {
    const msg = errMsg(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/notifications/search-user", async (req, res) => {
  try {
    const userRole = req.headers["x-user-role"] as string;
    if (userRole !== "superadmin" && userRole !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { email } = req.query as { email?: string };
    if (!email) {
      res.status(400).json({ error: "email query param required" });
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, role")
      .ilike("email", `%${email}%`)
      .limit(5);

    if (error) throw error;
    res.json(data || []);
  } catch (err: unknown) {
    const msg = errMsg(err);
    res.status(500).json({ error: msg });
  }
});

function mapNotification(row: Record<string, unknown>) {
  return {
    id: row.id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    senderRole: row.sender_role,
    recipientId: row.recipient_id,
    recipientEmail: row.recipient_email,
    title: row.title,
    message: row.message,
    isPublic: row.is_public,
    isRead: row.is_read,
    isDeleted: row.is_deleted,
    createdAt: row.created_at,
  };
}

export default router;
