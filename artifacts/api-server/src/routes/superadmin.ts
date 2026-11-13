import { Router, type IRouter } from "express";
import { supabase } from "../lib/supabase.js";
import PDFDocument from "pdfkit";

const router: IRouter = Router();

const requireSuperAdmin = (req: Parameters<Parameters<typeof router.get>[1]>[0], res: Parameters<Parameters<typeof router.get>[1]>[1]) => {
  const userRole = req.headers["x-user-role"] as string;
  if (userRole !== "superadmin") {
    res.status(403).json({ error: "Super admin access required" });
    return false;
  }
  return true;
};

// ─── Revenue ─────────────────────────────────────────────────────────────────

router.get("/superadmin/revenue", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const { period, startDate, endDate } = req.query as Record<string, string>;

    let start: string | null = null;
    let end: string | null = null;
    let periodLabel = "All Time";

    const now = new Date();
    if (period === "today") {
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      start = todayStart.toISOString();
      periodLabel = "Today";
    } else if (period === "last30days") {
      start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      periodLabel = "Last 30 Days";
    } else if (period === "lastmonth") {
      const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      start = firstDayLastMonth.toISOString();
      end = lastDayLastMonth.toISOString();
      periodLabel = "Last Month";
    } else if (period === "custom" && startDate && endDate) {
      const startD = new Date(startDate);
      startD.setHours(0, 0, 0, 0);
      const endD = new Date(endDate);
      endD.setHours(23, 59, 59, 999);
      start = startD.toISOString();
      end = endD.toISOString();
      periodLabel = `${startDate} to ${endDate}`;
    }

    let paymentsQuery = supabase.from("payments").select("*").eq("status", "success");
    if (start) paymentsQuery = paymentsQuery.gte("created_at", start);
    if (end) paymentsQuery = paymentsQuery.lte("created_at", end);

    // Build paid withdrawals query with the same period filter
    let paidWithdrawalsQuery = supabase
      .from("withdrawal_requests")
      .select("id, amount, status")
      .eq("status", "paid");
    if (start) paidWithdrawalsQuery = paidWithdrawalsQuery.gte("paid_at", start);
    if (end) paidWithdrawalsQuery = paidWithdrawalsQuery.lte("paid_at", end);

    // Build refund history query with the same period filter
    let refundHistoryQuery = supabase.from("refund_history").select("amount");
    if (start) refundHistoryQuery = refundHistoryQuery.gte("created_at", start);
    if (end) refundHistoryQuery = refundHistoryQuery.lte("created_at", end);

    // Unpaid withdrawals are always all-time (pending + approved = what's owed regardless of period)
    const [
      { data: payments, error },
      { data: paidWithdrawalRows },
      { data: unpaidWithdrawalRows },
      { data: allDeductions },
      { data: refundRows },
      { data: researcherProfiles },
    ] = await Promise.all([
      paymentsQuery,
      paidWithdrawalsQuery,
      supabase.from("withdrawal_requests").select("id, amount, status").in("status", ["pending", "approved"]),
      supabase.from("system_revenue_deductions").select("*").eq("status", "approved"),
      refundHistoryQuery,
      supabase.from("profiles").select("wallet_balance, pending_wallet").eq("role", "admin"),
    ]);

    if (error) throw error;

    // "full" payments cover the entire order amount upfront — count them as deposits
    // (there is no separate balance payment when a student pays in full)
    const grossDeposits = (payments || [])
      .filter((p) => p.payment_type === "deposit" || p.payment_type === "full")
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    const grossBalances = (payments || [])
      .filter((p) => p.payment_type === "balance")
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    // Total refunded amounts — can cover deposit-only or full (deposit + balance)
    const totalRefunds = (refundRows || [])
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

    // Deduct refunds proportionally: cap deposit deduction at grossDeposits,
    // then deduct remainder from balances
    const depositRefunds = Math.min(totalRefunds, grossDeposits);
    const balanceRefunds = Math.max(0, totalRefunds - depositRefunds);

    const totalDeposits = grossDeposits - depositRefunds;
    const totalBalances = grossBalances - balanceRefunds;
    const totalRevenue = totalDeposits + totalBalances;

    // Paid withdrawals filtered by selected period; unpaid always all-time
    const paidWithdrawals = (paidWithdrawalRows || [])
      .reduce((sum, w) => sum + (Number(w.amount) || 0), 0);

    const unpaidWithdrawals = (unpaidWithdrawalRows || [])
      .reduce((sum, w) => sum + (Number(w.amount) || 0), 0);

    // System revenue = what the platform keeps after paying researchers
    const systemRevenue = totalRevenue - paidWithdrawals;

    // Approved deductions from system revenue
    const totalApprovedDeductions = (allDeductions || [])
      .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

    // Net profit = systemRevenue - approved deductions
    const netProfit = systemRevenue - totalApprovedDeductions;

    // Total researcher wallet balances (money earned but not yet withdrawn)
    const totalResearcherWalletBalances = (researcherProfiles || [])
      .reduce((sum, p) => sum + (Number(p.wallet_balance) || 0), 0);

    // Total locked admin earnings = pending_wallet across all admins
    // (earnings locked in reserve, will be released to wallet_balance once the order is marked complete)
    const totalLockedAdminEarnings = (researcherProfiles || [])
      .reduce((sum, p) => sum + (Number(p.pending_wallet) || 0), 0);

    // Total pending disbursement = what the system owes researchers in full
    // (wallet balances not yet withdrawn + pending/approved withdrawal requests not yet paid)
    const totalPendingDisbursement = totalResearcherWalletBalances + unpaidWithdrawals;

    // Admin breakdown + unclaimed orders revenue
    const paymentOrderIds = [...new Set((payments || []).map((p: { order_id: string }) => p.order_id).filter(Boolean))];
    const adminBreakdownMap: Record<string, { adminId: string; adminName: string; completedOrders: number; totalRevenue: number }> = {};

    let unclaimedOrdersRevenue = 0;

    // Fetch all orders in parallel: claimed (for admin breakdown) and ALL unassigned (for unclaimed revenue)
    const claimedOrdersPromise = paymentOrderIds.length > 0
      ? (() => {
          const idFilters = paymentOrderIds.map(id => `id.eq.${id}`).join(",");
          const orderIdFilters = paymentOrderIds.map(id => `order_id.eq.${id}`).join(",");
          return supabase
            .from("orders")
            .select("id, order_id, assigned_admin_id, assigned_admin_name")
            .or(`${idFilters},${orderIdFilters}`)
            .not("assigned_admin_id", "is", null);
        })()
      : Promise.resolve({ data: [] as { id: string; order_id: string; assigned_admin_id: string; assigned_admin_name: string }[] });

    // Unclaimed = paid orders waiting for a researcher to be assigned (pending_assignment status)
    const unclaimedOrdersPromise = supabase
      .from("orders")
      .select("id, order_id")
      .eq("status", "pending_assignment");

    const [{ data: claimedOrders }, { data: allUnclaimedOrders }] = await Promise.all([
      claimedOrdersPromise,
      unclaimedOrdersPromise,
    ]);

    // Build admin revenue breakdown from claimed orders
    if (paymentOrderIds.length > 0) {
      for (const order of claimedOrders || []) {
        if (!order.assigned_admin_id) continue;
        const orderPayments = (payments || []).filter((p: { order_id: string; amount: number }) =>
          p.order_id === order.id || p.order_id === order.order_id
        );
        const orderRevenue = orderPayments.reduce((sum: number, p: { amount: number }) => sum + (p.amount || 0), 0);

        if (!adminBreakdownMap[order.assigned_admin_id]) {
          adminBreakdownMap[order.assigned_admin_id] = {
            adminId: order.assigned_admin_id,
            adminName: order.assigned_admin_name || "Unknown",
            completedOrders: 0,
            totalRevenue: 0,
          };
        }
        adminBreakdownMap[order.assigned_admin_id].completedOrders++;
        adminBreakdownMap[order.assigned_admin_id].totalRevenue += orderRevenue;
      }
    }

    // Build a set of ALL unclaimed order IDs (both UUID and display ID) for fast lookup
    const unclaimedIds = new Set<string>();
    for (const order of allUnclaimedOrders || []) {
      if (order.id) unclaimedIds.add(order.id);
      if (order.order_id) unclaimedIds.add(order.order_id);
    }

    // Sum payments whose order_id matches any unclaimed order
    unclaimedOrdersRevenue = (payments || [])
      .filter((p: { order_id: string }) => unclaimedIds.has(p.order_id))
      .reduce((sum: number, p: { amount: number }) => sum + (Number(p.amount) || 0), 0);

    // Final system revenue = net profit minus pending disbursement minus locked admin earnings
    // minus half of unclaimed orders (system will eventually pay researchers ~50% when claimed)
    const trueSystemRevenue = netProfit - totalPendingDisbursement - totalLockedAdminEarnings - (unclaimedOrdersRevenue * 0.5);

    res.json({
      totalRevenue,
      totalDeposits,
      totalBalances,
      totalRefunds,
      orderCount: paymentOrderIds.length,
      adminBreakdown: Object.values(adminBreakdownMap),
      periodLabel,
      // Financial audit fields
      paidWithdrawals,
      unpaidWithdrawals,
      systemRevenue,
      totalApprovedDeductions,
      netProfit,
      // Liability / true ownership fields
      totalResearcherWalletBalances,
      totalLockedAdminEarnings,
      totalPendingDisbursement,
      unclaimedOrdersRevenue,
      trueSystemRevenue,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── System Revenue Deductions ────────────────────────────────────────────────

router.get("/superadmin/revenue/deductions", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    // Fetch all superadmins and deductions in parallel
    const [
      { data: deductions, error },
      { data: allSuperadmins },
    ] = await Promise.all([
      supabase.from("system_revenue_deductions").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, email").eq("role", "superadmin"),
    ]);

    if (error) throw error;

    const superadminList = (allSuperadmins || []).map((s) => ({
      id: s.id,
      name: s.full_name || s.email,
      email: s.email,
    }));

    // Fetch approvals for all deductions
    const deductionIds = (deductions || []).map((d) => d.id);
    const approvalsMap: Record<string, { id: string; superadminId: string; superadminName: string; action: string; note?: string; createdAt: string }[]> = {};

    if (deductionIds.length > 0) {
      const { data: approvals } = await supabase
        .from("system_revenue_deduction_approvals")
        .select("*")
        .in("deduction_id", deductionIds)
        .order("created_at", { ascending: true });

      for (const a of approvals || []) {
        if (!approvalsMap[a.deduction_id]) approvalsMap[a.deduction_id] = [];
        approvalsMap[a.deduction_id].push({
          id: a.id,
          superadminId: a.superadmin_id,
          superadminName: a.superadmin_name,
          action: a.action,
          note: a.note,
          createdAt: a.created_at,
        });
      }
    }

    const result = (deductions || []).map((d) => {
      const approvals = approvalsMap[d.id] || [];
      const votes = approvals.filter((a) => a.action === "approved" || a.action === "rejected");
      const votedIds = new Set(votes.map((a) => a.superadminId));

      // Build per-superadmin vote status
      const superadminStatuses = superadminList.map((sa) => {
        const vote = votes.find((v) => v.superadminId === sa.id);
        return {
          id: sa.id,
          name: sa.name,
          email: sa.email,
          action: vote ? vote.action : "pending",
          note: vote?.note || null,
          votedAt: vote ? vote.createdAt : null,
        };
      });

      return {
        id: d.id,
        amount: Number(d.amount),
        reason: d.reason,
        status: d.status,
        submittedBy: d.submitted_by,
        submittedByName: d.submitted_by_name,
        totalSuperadminsRequired: d.total_superadmins_required,
        createdAt: d.created_at,
        approvedAt: d.approved_at,
        rejectedAt: d.rejected_at,
        rejectedByName: d.rejected_by_name,
        rejectedReason: d.rejected_reason,
        approvals,
        superadminStatuses,
      };
    });

    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/superadmin/revenue/deductions", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const userId = req.headers["x-user-id"] as string;
    const userName = req.headers["x-user-name"] as string;

    const { amount, reason } = req.body as { amount: number; reason: string };

    if (!amount || amount <= 0) {
      res.status(400).json({ error: "Amount must be greater than 0" });
      return;
    }
    if (!reason?.trim()) {
      res.status(400).json({ error: "Reason is required" });
      return;
    }

    // Count total superadmins to know how many approvals are needed
    const { data: superadmins } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "superadmin");

    const totalRequired = (superadmins || []).length || 1;

    const { data: deduction, error } = await supabase
      .from("system_revenue_deductions")
      .insert({
        amount,
        reason: reason.trim(),
        status: "pending_approval",
        submitted_by: userId,
        submitted_by_name: userName,
        total_superadmins_required: totalRequired,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    // Record the submitter's action in the audit log
    await supabase.from("system_revenue_deduction_approvals").insert({
      deduction_id: deduction.id,
      superadmin_id: userId,
      superadmin_name: userName,
      action: "submitted",
      note: reason.trim(),
      created_at: new Date().toISOString(),
    });

    res.status(201).json({ id: deduction.id, status: "pending_approval" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/superadmin/revenue/deductions/:id/approve", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const userId = req.headers["x-user-id"] as string;
    const userName = req.headers["x-user-name"] as string;
    const { id } = req.params;
    const { action, note } = req.body as { action: "approved" | "rejected"; note?: string };

    if (action !== "approved" && action !== "rejected") {
      res.status(400).json({ error: "action must be 'approved' or 'rejected'" });
      return;
    }
    if (action === "rejected" && !note?.trim()) {
      res.status(400).json({ error: "A reason is required when rejecting a deduction." });
      return;
    }

    const { data: deduction, error: fetchError } = await supabase
      .from("system_revenue_deductions")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !deduction) {
      res.status(404).json({ error: "Deduction not found" });
      return;
    }

    if (deduction.status !== "pending_approval") {
      res.status(400).json({ error: `Deduction is already ${deduction.status}` });
      return;
    }

    // Check if this superadmin already voted
    const { data: existingVote } = await supabase
      .from("system_revenue_deduction_approvals")
      .select("id")
      .eq("deduction_id", id)
      .eq("superadmin_id", userId)
      .in("action", ["approved", "rejected"])
      .maybeSingle();

    if (existingVote) {
      res.status(400).json({ error: "You have already voted on this deduction" });
      return;
    }

    // Record this vote
    await supabase.from("system_revenue_deduction_approvals").insert({
      deduction_id: id,
      superadmin_id: userId,
      superadmin_name: userName,
      action,
      note: note?.trim() || null,
      created_at: new Date().toISOString(),
    });

    if (action === "rejected") {
      await supabase.from("system_revenue_deductions").update({
        status: "rejected",
        rejected_at: new Date().toISOString(),
        rejected_by_name: userName,
        rejected_reason: note?.trim() || null,
      }).eq("id", id);

      res.json({ status: "rejected" });
      return;
    }

    // Always use the live current superadmin count — not the stale snapshot
    const { data: currentSuperadmins } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "superadmin");

    const totalRequired = (currentSuperadmins || []).length || 1;

    // Update the stored count to stay in sync
    await supabase.from("system_revenue_deductions")
      .update({ total_superadmins_required: totalRequired })
      .eq("id", id);

    // Count distinct superadmins who have approved (not just submitted)
    const { data: approvals } = await supabase
      .from("system_revenue_deduction_approvals")
      .select("superadmin_id")
      .eq("deduction_id", id)
      .eq("action", "approved");

    const approvalCount = (approvals || []).length;

    if (approvalCount >= totalRequired) {
      await supabase.from("system_revenue_deductions").update({
        status: "approved",
        approved_at: new Date().toISOString(),
      }).eq("id", id);

      res.json({ status: "approved", fullyApproved: true });
    } else {
      res.json({ status: "pending_approval", approvalsGiven: approvalCount, required: totalRequired });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Refunds ──────────────────────────────────────────────────────────────────

router.get("/superadmin/refunds", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("status", "refund_requested")
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const orders = data || [];

    // Batch fetch all actual payments for these orders.
    // Payments may be stored with either the UUID (o.id) or the display ID (o.order_id),
    // depending on what the frontend passed at payment initialisation time.
    // We collect both sets and build a map keyed by UUID.
    let amountPaidByUUID: Record<string, number> = {};
    if (orders.length > 0) {
      const uuids = orders.map((o) => o.id);
      const displayIds = orders.map((o) => o.order_id).filter(Boolean);

      // Build reverse-lookup: any id value → UUID of that order
      const idToUUID: Record<string, string> = {};
      for (const o of orders) {
        idToUUID[o.id] = o.id;
        if (o.order_id) idToUUID[o.order_id] = o.id;
      }

      const allIds = [...uuids, ...displayIds];
      const { data: paymentsData } = await supabase
        .from("payments")
        .select("order_id, amount")
        .in("order_id", allIds)
        .eq("status", "success");

      for (const p of paymentsData || []) {
        const uuid = idToUUID[p.order_id];
        if (uuid) {
          amountPaidByUUID[uuid] = (amountPaidByUUID[uuid] || 0) + (Number(p.amount) || 0);
        }
      }
    }

    const refunds = orders.map((row) => ({
      id: row.id,
      orderId: row.order_id,
      studentId: row.student_id,
      studentName: row.student_name,
      studentEmail: row.student_email,
      studentPhoneNumber: row.student_phone_number,
      researchTopic: row.research_topic,
      levelOfStudy: row.level_of_study,
      serviceType: row.service_type,
      title: row.research_topic || row.title,
      totalAmount: row.total_amount,
      depositAmount: row.deposit_amount,
      balancePaid: row.balance_paid === true,
      amountPaid: amountPaidByUUID[row.id] ?? Number(row.deposit_amount) ?? 0,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
    }));

    res.json(refunds);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/superadmin/refund-history", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const { data, error } = await supabase
      .from("refund_history")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const mapped = (data || []).map((row: Record<string, unknown>) => ({
      id: row.id,
      orderId: row.order_id,
      orderDisplayId: row.order_display_id,
      studentId: row.student_id,
      studentName: row.student_name,
      studentEmail: row.student_email,
      amount: row.amount,
      approvedBy: row.approved_by,
      approvedByName: row.approved_by_name,
      createdAt: row.created_at,
    }));

    res.json(mapped);
  } catch (err: unknown) {
    res.json([]);
  }
});

// ─── Analytics ────────────────────────────────────────────────────────────────

router.get("/superadmin/analytics", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const [
      { data: allOrders },
      { data: students },
      { data: admins },
      { data: recentOrders },
    ] = await Promise.all([
      supabase.from("orders").select("id, status"),
      supabase.from("profiles").select("id").eq("role", "student"),
      supabase.from("profiles").select("id").eq("role", "admin"),
      supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    // Exclude refunded orders from counts
    const countableOrders = (allOrders || []).filter(o => o.status !== "refunded");
    const total = countableOrders.length;
    const pending = countableOrders.filter((o) => o.status === "pending_payment" || o.status === "pending_assignment").length;
    const active = countableOrders.filter((o) => ["assigned", "in_progress", "under_review"].includes(o.status)).length;
    const completed = countableOrders.filter((o) => ["completed", "ready_for_download", "closed"].includes(o.status)).length;

    res.json({
      totalOrders: total,
      pendingOrders: pending,
      activeOrders: active,
      completedOrders: completed,
      totalStudents: students?.length || 0,
      totalAdmins: admins?.length || 0,
      recentOrders: recentOrders?.map(mapOrder) || [],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Orders Management ────────────────────────────────────────────────────────

router.get("/superadmin/orders", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const { search, status, limit = "50", offset = "0" } = req.query as Record<string, string>;

    let query = supabase.from("orders").select("*").order("created_at", { ascending: false });

    if (status && status !== "all") query = query.eq("status", status);
    if (search) {
      query = query.or(
        `order_id.ilike.%${search}%,student_name.ilike.%${search}%,student_email.ilike.%${search}%,research_topic.ilike.%${search}%`
      );
    }

    query = query.range(Number(offset), Number(offset) + Number(limit) - 1);

    const { data, error } = await query;
    if (error) throw error;

    res.json(data?.map(mapOrder) || []);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/superadmin/orders/:orderId", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;
    const { orderId } = req.params;

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .or(`id.eq.${orderId},order_id.eq.${orderId}`)
      .single();

    if (error || !data) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json(mapOrder(data));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Admins ──────────────────────────────────────────────────────────────────

router.get("/superadmin/admins", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("*")
      .in("role", ["admin", "superadmin"])
      .order("created_at", { ascending: false });

    if (error) throw error;

    const admins = await Promise.all(
      (profiles || []).map(async (p) => {
        const { data: completedOrders } = await supabase
          .from("orders")
          .select("id", { count: "exact" })
          .eq("assigned_admin_id", p.id)
          .in("status", ["completed", "awaiting_balance", "ready_for_download", "closed"]);

        return {
          id: p.id,
          email: p.email,
          name: p.full_name,
          role: p.role,
          completedOrders: completedOrders?.length || 0,
          pendingWallet: Number(p.pending_wallet) || 0,
          walletBalance: Number(p.wallet_balance) || 0,
          nationalId: p.national_id || null,
          phoneNumber: p.phone_number || null,
          walletType: p.wallet_type || null,
          createdAt: p.created_at,
        };
      })
    );

    res.json(admins);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/superadmin/admins", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const { email, name, password, nationalId, phoneNumber } = req.body;

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name, role: "admin" },
    });

    if (authError || !authData.user) {
      res.status(400).json({ error: authError?.message || "Failed to create user" });
      return;
    }

    const { error: profileError } = await supabase.from("profiles").upsert({
      id: authData.user.id,
      email,
      full_name: name,
      name,
      role: "admin",
      pending_wallet: 0,
      wallet_balance: 0,
      national_id: nationalId?.trim() || null,
      phone_number: phoneNumber?.trim() || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (profileError) console.error("Admin profile error:", profileError.message);

    res.status(201).json({
      id: authData.user.id,
      email,
      name,
      role: "admin",
      completedOrders: 0,
      nationalId: nationalId?.trim() || null,
      phoneNumber: phoneNumber?.trim() || null,
      createdAt: authData.user.created_at,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.patch("/superadmin/admins/:adminId", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const { adminId } = req.params;
    const { name, email, phoneNumber, nationalId } = req.body as {
      name?: string;
      email?: string;
      phoneNumber?: string;
      nationalId?: string;
    };

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", adminId)
      .single();

    if (!profile || !["admin", "superadmin"].includes(profile.role)) {
      res.status(404).json({ error: "Admin not found" });
      return;
    }

    const profileUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name) { profileUpdates.full_name = name; profileUpdates.name = name; }
    if (phoneNumber !== undefined) profileUpdates.phone_number = phoneNumber.trim() || null;
    if (nationalId !== undefined) profileUpdates.national_id = nationalId.trim() || null;

    const { error: profileError } = await supabase
      .from("profiles")
      .update(profileUpdates)
      .eq("id", adminId);

    if (profileError) throw profileError;

    if (email) {
      const { error: authError } = await supabase.auth.admin.updateUserById(adminId, { email });
      if (authError) throw authError;
      await supabase.from("profiles").update({ email }).eq("id", adminId);
    }

    res.json({ success: true, message: "Admin updated successfully" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.delete("/superadmin/admins/:adminId", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const { adminId } = req.params;

    const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(adminId);
    if (deleteAuthError) {
      res.status(400).json({ error: deleteAuthError.message });
      return;
    }

    await supabase.from("profiles").delete().eq("id", adminId);

    res.json({ success: true, message: "Admin removed successfully" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/superadmin/admins/:adminId/reset-password", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const { adminId } = req.params;
    const { newPassword } = req.body as { newPassword?: string };

    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", adminId)
      .single();

    if (!profile || !["admin", "superadmin"].includes(profile.role)) {
      res.status(404).json({ error: "Admin not found" });
      return;
    }

    const { error } = await supabase.auth.admin.updateUserById(adminId, {
      password: newPassword,
    });

    if (error) throw error;
    res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Pricing (Per-Level) ─────────────────────────────────────────────────────

router.get("/superadmin/pricing", async (_req, res) => {
  try {
    const [{ data: levels }, { data: cfg }] = await Promise.all([
      supabase.from("level_pricing").select("*").order("level"),
      supabase.from("pricing_config").select("*").maybeSingle(),
    ]);

    res.json({
      levels: levels || [],
      depositPercentage: Number(cfg?.deposit_percentage) || 50,
      researchProposalPrice: Number(cfg?.research_proposal_price) || 1500,
      researchDissertationPrice: Number(cfg?.research_project_price) || 1500,
      completeResearchProjectPrice: Number(cfg?.complete_research_project_price) || 2500,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.patch("/superadmin/pricing", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const { depositPercentage, levels } = req.body as {
      depositPercentage?: number;
      levels?: Array<{
        level: string;
        research_proposal_price: number;
        research_dissertation_price: number;
        complete_research_project_price: number;
        deposit_percentage?: number;
      }>;
    };

    if (levels && levels.length > 0) {
      for (const lvl of levels) {
        const { data: existing } = await supabase
          .from("level_pricing")
          .select("id")
          .eq("level", lvl.level)
          .maybeSingle();

        // Core payload — always safe (columns guaranteed to exist)
        const corePayload: Record<string, unknown> = {
          research_proposal_price: lvl.research_proposal_price,
          research_project_price: lvl.research_dissertation_price,
          deposit_percentage: lvl.deposit_percentage ?? depositPercentage ?? 50,
          updated_at: new Date().toISOString(),
        };

        if (existing) {
          const { error: coreErr } = await supabase
            .from("level_pricing")
            .update(corePayload)
            .eq("level", lvl.level);
          if (coreErr) {
            console.error(`[pricing] core update failed for ${lvl.level}:`, coreErr.message);
          }

          // Attempt to save complete_research_project_price separately.
          // This will fail gracefully if the column hasn't been added yet via the SQL migration.
          if (lvl.complete_research_project_price !== undefined) {
            const { error: crpErr } = await supabase
              .from("level_pricing")
              .update({ complete_research_project_price: lvl.complete_research_project_price })
              .eq("level", lvl.level);
            if (crpErr) {
              console.warn(`[pricing] complete_research_project_price column not yet available for ${lvl.level}. Run SUPABASE_MIGRATION_v2.sql to add it.`);
            }
          }
        } else {
          // New row — try with complete price first, fall back without it
          let inserted = false;
          if (lvl.complete_research_project_price !== undefined) {
            const { error: insertErr } = await supabase.from("level_pricing").insert({
              level: lvl.level,
              ...corePayload,
              complete_research_project_price: lvl.complete_research_project_price,
              created_at: new Date().toISOString(),
            });
            if (!insertErr) inserted = true;
          }
          if (!inserted) {
            await supabase.from("level_pricing").insert({
              level: lvl.level,
              ...corePayload,
              created_at: new Date().toISOString(),
            });
          }
        }
      }
    }

    if (depositPercentage !== undefined) {
      const { data: existing } = await supabase.from("pricing_config").select("id").maybeSingle();
      if (existing) {
        await supabase.from("pricing_config").update({
          deposit_percentage: depositPercentage,
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        // Try inserting with complete_research_project_price; fall back without
        const { error: cfgErr } = await supabase.from("pricing_config").insert({
          deposit_percentage: depositPercentage,
          research_project_price: 1500,
          research_proposal_price: 1500,
          complete_research_project_price: 2500,
          updated_at: new Date().toISOString(),
        });
        if (cfgErr) {
          await supabase.from("pricing_config").insert({
            deposit_percentage: depositPercentage,
            research_project_price: 1500,
            research_proposal_price: 1500,
            updated_at: new Date().toISOString(),
          });
        }
      }
    }

    res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Revisions ────────────────────────────────────────────────────────────────

router.get("/superadmin/revisions", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const { data: revisions, error } = await supabase
      .from("revisions")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Fetch completed file URLs for all orders that have revisions
    const orderIds = [...new Set((revisions || []).map((r) => r.order_id).filter(Boolean))];
    let orderDocMap: Record<string, { completedFileUrl?: string; completedFileLink?: string }> = {};
    if (orderIds.length > 0) {
      const { data: orderDocs } = await supabase
        .from("orders")
        .select("id, completed_file_url, completed_file_link")
        .in("id", orderIds);
      for (const o of orderDocs || []) {
        orderDocMap[o.id] = { completedFileUrl: o.completed_file_url, completedFileLink: o.completed_file_link };
      }
    }

    const byAdmin: Record<string, { adminId: string; adminName: string; pending: number; resolved: number; total: number; revisions: unknown[] }> = {};
    const unassigned: unknown[] = [];

    for (const r of revisions || []) {
      const docInfo = orderDocMap[r.order_id] || {};
      const mapped = {
        id: r.id,
        orderId: r.order_id,
        orderDisplayId: r.order_display_id,
        studentId: r.student_id,
        assignedAdminId: r.assigned_admin_id,
        assignedAdminName: r.assigned_admin_name,
        description: r.description,
        status: r.status,
        adminResponse: r.admin_response,
        completedFileUrl: docInfo.completedFileUrl,
        completedFileLink: docInfo.completedFileLink,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };

      if (!r.assigned_admin_id) {
        unassigned.push(mapped);
        continue;
      }

      if (!byAdmin[r.assigned_admin_id]) {
        byAdmin[r.assigned_admin_id] = {
          adminId: r.assigned_admin_id,
          adminName: r.assigned_admin_name || "Unknown",
          pending: 0,
          resolved: 0,
          total: 0,
          revisions: [],
        };
      }

      byAdmin[r.assigned_admin_id].total++;
      if (r.status === "resolved") byAdmin[r.assigned_admin_id].resolved++;
      else byAdmin[r.assigned_admin_id].pending++;
      byAdmin[r.assigned_admin_id].revisions.push(mapped);
    }

    res.json({
      total: revisions?.length || 0,
      byAdmin: Object.values(byAdmin),
      unassigned,
    });
  } catch (err: unknown) {
    res.json({ total: 0, byAdmin: [], unassigned: [] });
  }
});

// ─── Withdrawal Settings ──────────────────────────────────────────────────────

// withdrawal_day === 10 is the range-mode sentinel (matches withdrawals.ts)
const RANGE_MODE_SENTINEL = 10;

router.get("/superadmin/withdrawal-settings", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const { data, error } = await supabase
      .from("withdrawal_settings")
      .select("*")
      .maybeSingle();

    if (error) throw error;

    const withdrawalDay: number = data?.withdrawal_day ?? 4;
    const rawOpen: number = data?.open_hour ?? 8;
    const rawClose: number = data?.close_hour ?? 17;
    const isOpen: boolean = data?.is_open ?? true;
    const mode = withdrawalDay === RANGE_MODE_SENTINEL ? "range" : "day";

    res.json({
      withdrawalDay,
      openHour: rawOpen,
      closeHour: rawClose,
      isOpen,
      mode,
      windowStart: mode === "range" ? new Date(rawOpen * 1000).toISOString() : null,
      windowEnd: mode === "range" ? new Date(rawClose * 1000).toISOString() : null,
    });
  } catch {
    res.json({ withdrawalDay: 4, openHour: 8, closeHour: 17, isOpen: true, mode: "day", windowStart: null, windowEnd: null });
  }
});

router.patch("/superadmin/withdrawal-settings", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const { withdrawalDay, openHour, closeHour, isOpen, windowStart, windowEnd } = req.body as {
      withdrawalDay?: number;
      openHour?: number;
      closeHour?: number;
      isOpen?: boolean;
      windowStart?: string;
      windowEnd?: string;
    };

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (windowStart !== undefined && windowEnd !== undefined) {
      // Range mode: encode timestamps as Unix seconds in the existing int columns
      updates.withdrawal_day = RANGE_MODE_SENTINEL;
      updates.open_hour = Math.floor(new Date(windowStart).getTime() / 1000);
      updates.close_hour = Math.floor(new Date(windowEnd).getTime() / 1000);
    } else {
      if (withdrawalDay !== undefined) updates.withdrawal_day = withdrawalDay;
      if (openHour !== undefined) updates.open_hour = openHour;
      if (closeHour !== undefined) updates.close_hour = closeHour;
    }

    if (isOpen !== undefined) updates.is_open = isOpen;

    const { data: existing } = await supabase.from("withdrawal_settings").select("id").maybeSingle();

    if (existing) {
      await supabase.from("withdrawal_settings").update(updates).eq("id", existing.id);
    } else {
      await supabase.from("withdrawal_settings").insert({
        withdrawal_day: (updates.withdrawal_day as number) ?? 4,
        open_hour: (updates.open_hour as number) ?? 8,
        close_hour: (updates.close_hour as number) ?? 17,
        is_open: isOpen ?? true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Students ─────────────────────────────────────────────────────────────────

router.get("/superadmin/students", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "student")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const students = (data || []).map((p) => ({
      id: p.id,
      email: p.email,
      fullName: p.full_name,
      phoneNumber: p.phone_number || null,
      createdAt: p.created_at,
    }));

    res.json(students);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.patch("/superadmin/students/:studentId", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const { studentId } = req.params;
    const { fullName, phoneNumber } = req.body as { fullName?: string; phoneNumber?: string };

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (fullName) updates.full_name = fullName;
    if (phoneNumber !== undefined) updates.phone_number = phoneNumber;

    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", studentId)
      .eq("role", "student")
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: "Student not found" });
      return;
    }

    res.json({ id: data.id, email: data.email, fullName: data.full_name, phoneNumber: data.phone_number });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/superadmin/students/:studentId/reset-password", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const { studentId } = req.params;
    const { newPassword } = req.body as { newPassword?: string };

    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    const { error } = await supabase.auth.admin.updateUserById(studentId, {
      password: newPassword,
    });

    if (error) throw error;
    res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Student Orders ───────────────────────────────────────────────────────────

router.get("/superadmin/students/:studentId/orders", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;
    const { studentId } = req.params;
    const { status } = req.query as { status?: string };

    let query = supabase
      .from("orders")
      .select("*")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false });

    if (status === "completed") {
      query = query.in("status", ["completed", "awaiting_balance", "ready_for_download", "closed"]);
    } else if (status === "incomplete") {
      query = query.not("status", "in", '("completed","awaiting_balance","ready_for_download","closed","refunded")');
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data?.map(mapOrder) || []);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/superadmin/students/:studentId/orders/export-pdf", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;
    const { studentId } = req.params;
    const { status } = req.query as { status?: string };

    const { data: studentProfile } = await supabase
      .from("profiles")
      .select("full_name, email, phone_number")
      .eq("id", studentId)
      .single();

    let query = supabase
      .from("orders")
      .select("*")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false });

    if (status === "completed") {
      query = query.in("status", ["completed", "awaiting_balance", "ready_for_download", "closed"]);
    } else if (status === "incomplete") {
      query = query.not("status", "in", '("completed","awaiting_balance","ready_for_download","closed","refunded")');
    }

    const { data, error } = await query;
    if (error) throw error;
    const orders = data || [];

    const primaryColor = "#2563eb";
    const textDark = "#111827";
    const textMuted = "#6b7280";

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const statusLabel = status === "completed" ? "Completed" : status === "incomplete" ? "Incomplete" : "All";
    const filename = `student-orders-${statusLabel.toLowerCase()}-${Date.now()}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);

    // Header
    doc.rect(0, 0, doc.page.width, 90).fill(primaryColor);
    doc.fill("#fff").fontSize(24).font("Helvetica-Bold").text("SASYNA", 50, 25);
    doc.fontSize(10).font("Helvetica").text("The World of Research", 50, 55);
    doc.text(`${statusLabel} Orders Export`, 50, 68);
    doc.fill(textDark);

    // Student info
    const infoY = 105;
    doc.roundedRect(50, infoY, doc.page.width - 100, 60, 8).fill("#f0f4ff");
    doc.fill(primaryColor).fontSize(11).font("Helvetica-Bold").text(`Student: ${studentProfile?.full_name || "Unknown"}`, 70, infoY + 10);
    doc.fill(textMuted).fontSize(9).font("Helvetica").text(`Email: ${studentProfile?.email || "—"}`, 70, infoY + 28);
    doc.fill(textMuted).text(`Phone: ${studentProfile?.phone_number || "—"}  ·  Total Orders: ${orders.length}`, 70, infoY + 42);
    doc.fill(textDark);

    // Table header
    const tableTop = infoY + 80;
    const colX = [50, 120, 230, 310, 380, 450];
    const headers = ["Order ID", "Topic", "Level", "Type", "Status", "Amount"];

    doc.roundedRect(50, tableTop - 8, doc.page.width - 100, 24, 4).fill(primaryColor);
    doc.fill("#fff").fontSize(8.5).font("Helvetica-Bold");
    headers.forEach((h, i) => {
      doc.text(h, colX[i], tableTop, { width: (colX[i + 1] || 540) - colX[i] - 4 });
    });
    doc.fill(textDark);

    let y = tableTop + 24;
    orders.forEach((order, idx) => {
      if (y > 720) { doc.addPage(); y = 50; }
      if (idx % 2 === 0) {
        doc.rect(50, y - 4, doc.page.width - 100, 22).fill("#f9fafb");
        doc.fill(textDark);
      }

      const statusColors: Record<string, string> = {
        completed: "#16a34a", ready_for_download: "#16a34a", closed: "#16a34a",
        pending_payment: "#d97706", pending_assignment: "#d97706",
        assigned: "#2563eb", in_progress: "#2563eb", under_review: "#7c3aed",
        refunded: "#dc2626",
      };
      const sc = statusColors[order.status as string] || textMuted;

      doc.fontSize(8).font("Helvetica");
      doc.fill(primaryColor).font("Helvetica-Bold").text(order.order_id as string || "—", colX[0], y, { width: colX[1] - colX[0] - 4 });
      doc.fill(textDark).font("Helvetica").text(String(order.research_topic || "—").slice(0, 30), colX[1], y, { width: colX[2] - colX[1] - 4 });
      doc.fill(textMuted).text(order.level_of_study as string || "—", colX[2], y, { width: colX[3] - colX[2] - 4 });
      doc.fill(textMuted).text(order.service_type as string || "—", colX[3], y, { width: colX[4] - colX[3] - 4 });
      doc.fill(sc).font("Helvetica-Bold").text((order.status as string || "—").replace(/_/g, " ").toUpperCase(), colX[4], y, { width: colX[5] - colX[4] - 4 });
      doc.fill(textDark).font("Helvetica").text(`KES ${Number(order.total_amount || 0).toLocaleString()}`, colX[5], y, { width: 60 });
      doc.fill(textDark);
      y += 22;

      // Show document URL if completed
      if ((order.completed_file_url || order.completed_file_link) && y < 720) {
        doc.fill(primaryColor).fontSize(7).text(
          `  ↳ Doc: ${order.completed_file_url || order.completed_file_link}`,
          70, y, { width: doc.page.width - 120 }
        );
        y += 14;
      }
    });

    // Footer
    doc.rect(0, doc.page.height - 40, doc.page.width, 40).fill("#f3f4f6");
    doc.fill(textMuted).fontSize(8).text(
      `Generated on ${new Date().toLocaleString("en-KE")} · Sasyna Research Platform`,
      50, doc.page.height - 28
    );

    doc.end();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Order URL edit (superadmin) ──────────────────────────────────────────────

router.patch("/superadmin/orders/:orderId/url", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;
    const { orderId } = req.params;
    const { fileUrl, fileLink } = req.body;

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
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Proposals Management ─────────────────────────────────────────────────────

function extractErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    if (typeof e.message === "string") return e.message;
    return JSON.stringify(err);
  }
  return String(err);
}

router.get("/superadmin/proposals", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_id, student_name, student_email, uploaded_file_url, uploaded_file_name, status, service_type, created_at")
      .not("uploaded_file_url", "is", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: extractErr(err) }); }
});

router.get("/superadmin/proposals/recycle-bin", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;
    const { data, error } = await supabase
      .from("proposal_recycle_bin")
      .select("*")
      .order("deleted_at", { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: extractErr(err) }); }
});

router.post("/superadmin/proposals/:orderId/soft-delete", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;
    const { orderId } = req.params;
    const deletedById = req.headers["x-user-id"] as string;
    const deletedByName = req.headers["x-user-name"] as string;

    const { data: order } = await supabase
      .from("orders")
      .select("id, order_id, student_name, student_email, uploaded_file_url, uploaded_file_name, status, service_type")
      .or(`id.eq.${orderId},order_id.eq.${orderId}`)
      .single();

    if (!order?.uploaded_file_url) {
      res.status(404).json({ error: "Order or proposal not found" }); return;
    }

    const { error: insertErr } = await supabase.from("proposal_recycle_bin").insert({
      order_id: order.id,
      order_display_id: order.order_id,
      student_name: order.student_name,
      student_email: order.student_email,
      file_path: order.uploaded_file_url,
      file_name: order.uploaded_file_name,
      service_type: order.service_type,
      order_status: order.status,
      deleted_by_id: deletedById || null,
      deleted_by_name: deletedByName || null,
    });
    if (insertErr) throw insertErr;

    await supabase.from("orders")
      .update({ uploaded_file_url: null, uploaded_file_name: null })
      .eq("id", order.id);

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: extractErr(err) }); }
});

router.post("/superadmin/proposals/recycle-bin/:id/restore", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;
    const { id } = req.params;

    const { data: item } = await supabase
      .from("proposal_recycle_bin").select("*").eq("id", id).single();
    if (!item) { res.status(404).json({ error: "Item not found in recycle bin" }); return; }

    await supabase.from("orders")
      .update({ uploaded_file_url: item.file_path, uploaded_file_name: item.file_name })
      .eq("id", item.order_id);

    await supabase.from("proposal_recycle_bin").delete().eq("id", id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: extractErr(err) }); }
});

router.delete("/superadmin/proposals/recycle-bin/:id", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;
    const { id } = req.params;

    const { data: item } = await supabase
      .from("proposal_recycle_bin").select("*").eq("id", id).single();
    if (!item) { res.status(404).json({ error: "Item not found" }); return; }

    await supabase.storage.from("proposals").remove([item.file_path]);
    await supabase.from("proposal_recycle_bin").delete().eq("id", id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: extractErr(err) }); }
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
    assignedAdminId: row.assigned_admin_id,
    assignedAdminName: row.assigned_admin_name,
    depositAmount: row.deposit_amount,
    totalAmount: row.total_amount,
    depositPaid: row.deposit_paid,
    balancePaid: row.balance_paid,
    paymentOption: row.payment_option,
    revisionCount: row.revision_count ?? 0,
    completedFileUrl: row.completed_file_url,
    completedFileLink: row.completed_file_link,
    completedFileStoragePath: row.completed_file_storage_path,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default router;
