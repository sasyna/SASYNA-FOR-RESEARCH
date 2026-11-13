import { Router, type IRouter } from "express";
import { supabase } from "../lib/supabase.js";

const router: IRouter = Router();

router.get("/admin/orders", async (req, res) => {
  try {
    const userRole = req.headers["x-user-role"] as string;
    const userId = req.headers["x-user-id"] as string;

    if (userRole !== "admin" && userRole !== "superadmin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    let query = supabase
      .from("orders")
      .select("*")
      .in("status", ["pending_assignment", "assigned", "in_progress", "under_review", "completed", "awaiting_balance", "ready_for_download"])
      .order("created_at", { ascending: false });

    if (userRole === "admin") {
      query = query.or(`assigned_admin_id.is.null,assigned_admin_id.eq.${userId}`);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json(data?.map(mapOrder) || []);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/admin/stats", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    const userRole = req.headers["x-user-role"] as string;

    if (userRole !== "admin" && userRole !== "superadmin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    const [
      { data: completed },
      { data: activeOrders },
      { data: awaitingBalance },
      { data: recentOrders },
      { data: profile },
    ] = await Promise.all([
      // Truly completed: work done and balance paid (ready_for_download) or awaiting balance
      supabase.from("orders").select("id").eq("assigned_admin_id", userId).in("status", ["awaiting_balance", "ready_for_download", "completed"]),
      // Active orders: assigned or in_progress or under_review
      supabase.from("orders").select("id").eq("assigned_admin_id", userId).in("status", ["assigned", "in_progress", "under_review"]),
      // Awaiting balance: admin completed work but student hasn't paid balance yet — include amounts for balance calc
      supabase.from("orders").select("id, admin_share, total_amount, deposit_amount").eq("assigned_admin_id", userId).eq("status", "awaiting_balance"),
      supabase.from("orders").select("*").eq("assigned_admin_id", userId).order("updated_at", { ascending: false }).limit(5),
      supabase.from("profiles").select("pending_wallet, wallet_balance").eq("id", userId).single(),
    ]);

    // Sum the balance portion (50% of the actual balance amount) the admin is waiting to receive
    const awaitingBalanceAmount = (awaitingBalance || []).reduce((sum, o) => {
      const total = Number(o.total_amount) || 0;
      const deposit = Number(o.deposit_amount) || total * 0.5;
      const balance = total - deposit;
      return sum + balance * 0.5;
    }, 0);

    res.json({
      totalCompleted: completed?.length || 0,
      totalInProgress: activeOrders?.length || 0,
      totalAssigned: awaitingBalance?.length || 0,
      awaitingBalanceAmount,
      pendingWallet: Number(profile?.pending_wallet) || 0,
      walletBalance: Number(profile?.wallet_balance) || 0,
      recentOrders: recentOrders?.map(mapOrder) || [],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
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
    assignedAdminId: row.assigned_admin_id,
    assignedAdminName: row.assigned_admin_name,
    depositAmount: row.deposit_amount,
    totalAmount: row.total_amount,
    depositPaid: row.deposit_paid,
    balancePaid: row.balance_paid,
    depositReference: row.deposit_reference,
    balanceReference: row.balance_reference,
    completedFileUrl: row.completed_file_url,
    completedFileLink: row.completed_file_link,
    completedFileStoragePath: row.completed_file_storage_path,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default router;
