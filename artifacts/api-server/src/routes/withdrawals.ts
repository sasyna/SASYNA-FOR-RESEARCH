import { Router } from "express";
import type { Request, Response } from "express";
import { supabase } from "../lib/supabase.js";
import PDFDocument from "pdfkit";

const router = Router();

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as Record<string, unknown>).message);
  return String(err);
}

const requireAdmin = (req: Request, res: Response): boolean => {
  const role = req.headers["x-user-role"] as string;
  if (role !== "admin" && role !== "superadmin") {
    res.status(403).json({ error: "Admins only" });
    return false;
  }
  return true;
};

const requireSuperAdmin = (req: Request, res: Response): boolean => {
  const role = req.headers["x-user-role"] as string;
  if (role !== "superadmin") {
    res.status(403).json({ error: "Super admin access required" });
    return false;
  }
  return true;
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// withdrawal_day === 10 is the sentinel for "date-range mode".
// In range mode, open_hour / close_hour store Unix timestamp SECONDS for the
// window start / end (values fit in PostgreSQL int4 until ~2038).
const RANGE_MODE_SENTINEL = 10;

type WithdrawalSettings =
  | { mode: "day"; withdrawalDay: number; openHour: number; closeHour: number; isOpen: boolean; windowStart: null; windowEnd: null }
  | { mode: "range"; withdrawalDay: number; openHour: number; closeHour: number; isOpen: boolean; windowStart: string; windowEnd: string };

async function getWithdrawalSettings(): Promise<WithdrawalSettings> {
  try {
    const { data } = await supabase.from("withdrawal_settings").select("*").maybeSingle();
    const withdrawalDay: number = data?.withdrawal_day ?? 4;
    const rawOpen: number = data?.open_hour ?? 8;
    const rawClose: number = data?.close_hour ?? 17;
    const isOpen: boolean = data?.is_open ?? true;

    if (withdrawalDay === RANGE_MODE_SENTINEL) {
      return {
        mode: "range",
        withdrawalDay,
        openHour: rawOpen,
        closeHour: rawClose,
        isOpen,
        windowStart: new Date(rawOpen * 1000).toISOString(),
        windowEnd: new Date(rawClose * 1000).toISOString(),
      };
    }
    return { mode: "day", withdrawalDay, openHour: rawOpen, closeHour: rawClose, isOpen, windowStart: null, windowEnd: null };
  } catch {
    return { mode: "day", withdrawalDay: 4, openHour: 8, closeHour: 17, isOpen: true, windowStart: null, windowEnd: null };
  }
}

router.get("/withdrawals/open-status", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const settings = await getWithdrawalSettings();
    const now = new Date();

    if (settings.mode === "range") {
      const start = new Date(settings.windowStart);
      const end = new Date(settings.windowEnd);
      const isOpen = settings.isOpen && now >= start && now <= end;
      res.json({
        isOpen,
        mode: "range",
        isManuallyOpen: settings.isOpen,
        windowStart: settings.windowStart,
        windowEnd: settings.windowEnd,
        dayName: DAY_NAMES[now.getDay()],
        withdrawalDayName: null,
        withdrawalDay: null,
        openHour: null,
        closeHour: null,
        daysUntilWithdrawal: 0,
        currentHour: now.getHours(),
      });
      return;
    }

    const day = now.getDay();
    const hour = now.getHours();
    const isRightDay = day === settings.withdrawalDay;
    const isRightHour = hour >= settings.openHour && hour < settings.closeHour;
    const isOpen = settings.isOpen && isRightDay && isRightHour;
    const daysUntil = isRightDay ? 0 : (settings.withdrawalDay - day + 7) % 7 || 7;

    res.json({
      isOpen,
      mode: "day",
      isManuallyOpen: settings.isOpen,
      dayName: DAY_NAMES[day],
      withdrawalDayName: DAY_NAMES[settings.withdrawalDay],
      withdrawalDay: settings.withdrawalDay,
      openHour: settings.openHour,
      closeHour: settings.closeHour,
      daysUntilWithdrawal: daysUntil,
      currentHour: hour,
      windowStart: null,
      windowEnd: null,
    });
  } catch (err: unknown) {
    const msg = errMsg(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/withdrawals/my", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const userId = req.headers["x-user-id"] as string;

    const { data, error } = await supabase
      .from("withdrawal_requests")
      .select("*")
      .eq("admin_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data?.map(mapWithdrawal) || []);
  } catch (err: unknown) {
    const msg = errMsg(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/withdrawals/request", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const userId = req.headers["x-user-id"] as string;

    const settings = await getWithdrawalSettings();
    const now = new Date();

    if (!settings.isOpen) {
      res.status(400).json({ error: "Withdrawals are currently closed by the administrator." });
      return;
    }

    if (settings.mode === "range") {
      const start = new Date(settings.windowStart);
      const end = new Date(settings.windowEnd);
      if (now < start || now > end) {
        const fmt = (d: Date) => d.toLocaleString("en-KE", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
        res.status(400).json({ error: `Withdrawals are only available from ${fmt(start)} to ${fmt(end)}.` });
        return;
      }
    } else {
      const day = now.getDay();
      const hour = now.getHours();
      if (day !== settings.withdrawalDay) {
        res.status(400).json({ error: `Withdrawals are only available on ${DAY_NAMES[settings.withdrawalDay]}s. Today is ${DAY_NAMES[day]}.` });
        return;
      }
      if (hour < settings.openHour || hour >= settings.closeHour) {
        res.status(400).json({ error: `Withdrawals are only available between ${settings.openHour}:00 and ${settings.closeHour}:00. Current time: ${hour}:00.` });
        return;
      }
    }

    const { notes } = req.body as { notes?: string };

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("full_name, email, wallet_balance, pending_wallet, wallet_type, wallet_mpesa_number, wallet_bank_name, wallet_bank_account_number, wallet_bank_account_name")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }

    if (!profile.wallet_type) {
      res.status(400).json({ error: "Please set up your wallet details (M-Pesa or Bank Account) in your Wallet Settings before requesting a withdrawal." });
      return;
    }

    const available = Number(profile.wallet_balance) || 0;
    if (available <= 0) {
      res.status(400).json({ error: "No available balance to withdraw." });
      return;
    }

    const { data: existing } = await supabase
      .from("withdrawal_requests")
      .select("id")
      .eq("admin_id", userId)
      .in("status", ["pending", "approved"])
      .limit(1);

    if (existing && existing.length > 0) {
      res.status(400).json({ error: "You already have a pending withdrawal request. Please wait for it to be processed." });
      return;
    }

    const { data: wr, error: wrError } = await supabase
      .from("withdrawal_requests")
      .insert({
        admin_id: userId,
        admin_name: profile.full_name || "Admin",
        admin_email: profile.email,
        amount: available,
        mpesa_number: profile.wallet_type === "mpesa" ? profile.wallet_mpesa_number : null,
        wallet_type: profile.wallet_type,
        wallet_mpesa_number: profile.wallet_type === "mpesa" ? profile.wallet_mpesa_number : null,
        wallet_bank_name: profile.wallet_type === "bank" ? profile.wallet_bank_name : null,
        wallet_bank_account_number: profile.wallet_type === "bank" ? profile.wallet_bank_account_number : null,
        wallet_bank_account_name: profile.wallet_type === "bank" ? profile.wallet_bank_account_name : null,
        notes: notes || null,
        status: "pending",
        requested_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (wrError) throw wrError;

    // Immediately deduct from wallet balance so the researcher knows it's pending
    const newBalance = Math.max(0, available - available);
    await supabase
      .from("profiles")
      .update({ wallet_balance: newBalance, updated_at: new Date().toISOString() })
      .eq("id", userId);

    res.status(201).json(mapWithdrawal(wr));
  } catch (err: unknown) {
    const msg = errMsg(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/withdrawals/all", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const { date, status } = req.query as { date?: string; status?: string };

    let query = supabase.from("withdrawal_requests").select("*").order("created_at", { ascending: false });

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      query = query.gte("created_at", startOfDay.toISOString()).lte("created_at", endOfDay.toISOString());
    }

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];

    const rowsWithProfiles = await Promise.all(
      rows.map(async (wr) => {
        const { data: profile } = await supabase
          .from("profiles")
          .select("national_id, phone_number, wallet_type, wallet_mpesa_number, wallet_bank_name, wallet_bank_account_number, wallet_bank_account_name")
          .eq("id", wr.admin_id)
          .single();
        return { ...wr, _profile: profile };
      })
    );

    res.json(rowsWithProfiles.map(mapWithdrawalWithProfile));
  } catch (err: unknown) {
    const msg = errMsg(err);
    res.status(500).json({ error: msg });
  }
});

// PDF Export for withdrawal requests
router.get("/withdrawals/export-pdf", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const { date } = req.query as { date?: string };

    let query = supabase.from("withdrawal_requests").select("*").order("created_at", { ascending: false });

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      query = query.gte("created_at", startOfDay.toISOString()).lte("created_at", endOfDay.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];
    const rowsWithProfiles = await Promise.all(
      rows.map(async (wr) => {
        const { data: profile } = await supabase
          .from("profiles")
          .select("national_id, phone_number")
          .eq("id", wr.admin_id)
          .single();
        return { ...wr, nationalId: profile?.national_id || null, phoneNumber: profile?.phone_number || null };
      })
    );

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const dateLabel = date ? new Date(date).toLocaleDateString("en-KE", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : "All Time";
    const filename = `withdrawals-${date || "all"}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);

    const primaryColor = "#2563eb";
    const textDark = "#111827";
    const textMuted = "#6b7280";

    doc.rect(0, 0, doc.page.width, 90).fill(primaryColor);
    doc.fill("#fff").fontSize(24).font("Helvetica-Bold").text("SASYNA", 50, 25);
    doc.fontSize(10).font("Helvetica").text("The World of Research", 50, 55);
    doc.text(`Withdrawal Report — ${dateLabel}`, 50, 68);
    doc.fill(textDark);

    doc.moveDown(2.5);

    const totalAmount = rowsWithProfiles.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const summaryY = 105;
    doc.roundedRect(50, summaryY, doc.page.width - 100, 52, 8).fill("#f0f4ff");
    doc.fill(primaryColor).fontSize(11).font("Helvetica-Bold").text(`Total Requests: ${rowsWithProfiles.length}`, 70, summaryY + 10);
    doc.fill(textDark).fontSize(11).font("Helvetica-Bold").text(
      `Total Amount: KES ${totalAmount.toLocaleString("en-KE", { minimumFractionDigits: 2 })}`,
      70, summaryY + 28
    );
    doc.fill(textDark);

    doc.moveDown(0.5);

    const tableTop = summaryY + 70;
    const colX = [50, 155, 230, 320, 390, 480];
    const headers = ["Researcher", "National ID", "Phone", "Amount (KES)", "Method", "Status"];

    doc.roundedRect(50, tableTop - 8, doc.page.width - 100, 24, 4).fill(primaryColor);
    doc.fill("#fff").fontSize(9).font("Helvetica-Bold");
    headers.forEach((h, i) => {
      doc.text(h, colX[i], tableTop, { width: (colX[i + 1] || 540) - colX[i] - 5 });
    });
    doc.fill(textDark);

    let y = tableTop + 24;
    rowsWithProfiles.forEach((row, idx) => {
      if (y > 720) {
        doc.addPage();
        y = 50;
      }

      if (idx % 2 === 0) {
        doc.rect(50, y - 4, doc.page.width - 100, 22).fill("#f9fafb");
        doc.fill(textDark);
      }

      const statusColor = row.status === "paid" ? "#16a34a" : row.status === "approved" ? "#2563eb" : row.status === "rejected" ? "#dc2626" : "#d97706";

      const paymentMethod = row.wallet_type === "bank"
        ? `Bank: ${row.wallet_bank_name || ""} (${row.wallet_bank_account_number || ""})`
        : `M-Pesa: ${row.wallet_mpesa_number || row.mpesa_number || ""}`;

      doc.fontSize(8.5).font("Helvetica");
      doc.fill(textDark).text(row.admin_name || "—", colX[0], y, { width: colX[1] - colX[0] - 5 });
      doc.fill(textMuted).text(row.nationalId || "—", colX[1], y, { width: colX[2] - colX[1] - 5 });
      doc.fill(textMuted).text(row.phoneNumber || "—", colX[2], y, { width: colX[3] - colX[2] - 5 });
      doc.fill(textDark).font("Helvetica-Bold").text(
        Number(row.amount).toLocaleString("en-KE", { minimumFractionDigits: 2 }),
        colX[3], y, { width: colX[4] - colX[3] - 5 }
      );
      doc.fill(textMuted).font("Helvetica").text(paymentMethod, colX[4], y, { width: colX[5] - colX[4] - 5 });
      doc.fill(statusColor).font("Helvetica-Bold").text((row.status || "").toUpperCase(), colX[5], y, { width: 60 });
      doc.fill(textDark).font("Helvetica");

      y += 22;
    });

    doc.rect(0, doc.page.height - 40, doc.page.width, 40).fill("#f3f4f6");
    doc.fill(textMuted).fontSize(8).text(
      `Generated on ${new Date().toLocaleString("en-KE")} · Sasyna Research Platform`,
      50, doc.page.height - 28
    );

    doc.end();
  } catch (err: unknown) {
    const msg = errMsg(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/withdrawals/:id/researcher-orders", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;
    const { id } = req.params;

    const { data: wr, error: wrError } = await supabase
      .from("withdrawal_requests")
      .select("admin_id, admin_name, requested_at")
      .eq("id", id)
      .single();

    if (wrError || !wr) {
      res.status(404).json({ error: "Withdrawal request not found" });
      return;
    }

    // Find the most recent PAID withdrawal for this researcher before this one.
    // Only paid withdrawals truly "consumed" earnings — rejected withdrawals refund
    // the balance back, so their orders still count toward the next request.
    const { data: lastPaidWithdrawal } = await supabase
      .from("withdrawal_requests")
      .select("requested_at")
      .eq("admin_id", wr.admin_id)
      .neq("id", id)
      .eq("status", "paid")
      .lt("requested_at", wr.requested_at)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Include all orders that were completed before this withdrawal was requested
    // and after the last paid withdrawal zeroed the wallet (beginning of time if none).
    let ordersQuery = supabase
      .from("orders")
      .select("id, order_id, research_topic, service_type, level_of_study, total_amount, admin_share, completed_file_url, completed_file_link, completed_at, status, deposit_paid, balance_paid")
      .eq("assigned_admin_id", wr.admin_id)
      .in("status", ["completed", "awaiting_balance", "ready_for_download", "closed"])
      .lte("completed_at", wr.requested_at)
      .order("completed_at", { ascending: false });

    if (lastPaidWithdrawal?.requested_at) {
      ordersQuery = ordersQuery.gt("completed_at", lastPaidWithdrawal.requested_at);
    }

    const { data: orders, error: ordersError } = await ordersQuery;

    if (ordersError) throw ordersError;

    res.json({
      adminId: wr.admin_id,
      adminName: wr.admin_name,
      orders: (orders || []).map(o => ({
        id: o.id,
        orderId: o.order_id,
        researchTopic: o.research_topic,
        serviceType: o.service_type,
        levelOfStudy: o.level_of_study,
        totalAmount: o.total_amount,
        adminShare: o.admin_share,
        completedFileUrl: o.completed_file_url,
        completedFileLink: o.completed_file_link,
        completedAt: o.completed_at,
        status: o.status,
        depositPaid: o.deposit_paid,
        balancePaid: o.balance_paid,
      })),
    });
  } catch (err: unknown) {
    const msg = errMsg(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/withdrawals/:id/approve", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;
    const { id } = req.params;
    const { superadminNotes } = req.body as { superadminNotes?: string };

    const { data: wr, error: fetchError } = await supabase
      .from("withdrawal_requests")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !wr) {
      res.status(404).json({ error: "Withdrawal request not found" });
      return;
    }

    if (wr.status !== "pending") {
      res.status(400).json({ error: `Cannot approve a request with status: ${wr.status}` });
      return;
    }

    const { data: updated, error: updateError } = await supabase
      .from("withdrawal_requests")
      .update({
        status: "approved",
        superadmin_notes: superadminNotes || null,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) throw updateError;
    res.json(mapWithdrawal(updated));
  } catch (err: unknown) {
    const msg = errMsg(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/withdrawals/:id/mark-paid", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;
    const { id } = req.params;
    const { superadminNotes } = req.body as { superadminNotes?: string };

    const { data: wr, error: fetchError } = await supabase
      .from("withdrawal_requests")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !wr) {
      res.status(404).json({ error: "Withdrawal request not found" });
      return;
    }

    if (wr.status !== "approved" && wr.status !== "pending") {
      res.status(400).json({ error: `Cannot mark paid a request with status: ${wr.status}` });
      return;
    }

    const { data: updated, error: updateError } = await supabase
      .from("withdrawal_requests")
      .update({
        status: "paid",
        superadmin_notes: superadminNotes || wr.superadmin_notes || null,
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Wallet was already deducted at request time, nothing to do here
    res.json(mapWithdrawal(updated));
  } catch (err: unknown) {
    const msg = errMsg(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/withdrawals/:id/reject", async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;
    const { id } = req.params;
    const { superadminNotes } = req.body as { superadminNotes?: string };

    const { data: wr, error: fetchError } = await supabase
      .from("withdrawal_requests")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !wr) {
      res.status(404).json({ error: "Withdrawal request not found" });
      return;
    }

    if (wr.status !== "pending" && wr.status !== "approved") {
      res.status(400).json({ error: `Cannot reject a request with status: ${wr.status}` });
      return;
    }

    const { data: updated, error: updateError } = await supabase
      .from("withdrawal_requests")
      .update({
        status: "rejected",
        superadmin_notes: superadminNotes || null,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Refund the amount back to the researcher's wallet
    const { data: profile } = await supabase
      .from("profiles")
      .select("wallet_balance")
      .eq("id", wr.admin_id)
      .single();

    const currentBalance = Number(profile?.wallet_balance) || 0;
    const refundedBalance = currentBalance + Number(wr.amount);

    await supabase
      .from("profiles")
      .update({ wallet_balance: refundedBalance, updated_at: new Date().toISOString() })
      .eq("id", wr.admin_id);

    res.json(mapWithdrawal(updated));
  } catch (err: unknown) {
    const msg = errMsg(err);
    res.status(500).json({ error: msg });
  }
});

function mapWithdrawal(row: Record<string, unknown>) {
  return {
    id: row.id,
    adminId: row.admin_id,
    adminName: row.admin_name,
    adminEmail: row.admin_email,
    amount: row.amount,
    status: row.status,
    mpesaNumber: row.mpesa_number,
    walletType: row.wallet_type,
    walletMpesaNumber: row.wallet_mpesa_number,
    walletBankName: row.wallet_bank_name,
    walletBankAccountNumber: row.wallet_bank_account_number,
    walletBankAccountName: row.wallet_bank_account_name,
    notes: row.notes,
    superadminNotes: row.superadmin_notes,
    requestedAt: row.requested_at,
    processedAt: row.processed_at,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapWithdrawalWithProfile(row: Record<string, unknown>) {
  const profile = row._profile as Record<string, unknown> | null;
  const base = mapWithdrawal(row);
  return {
    ...base,
    nationalId: profile?.national_id || row.national_id || null,
    phoneNumber: profile?.phone_number || row.phone_number || null,
    walletType: row.wallet_type || profile?.wallet_type || null,
    walletMpesaNumber: row.wallet_mpesa_number || profile?.wallet_mpesa_number || null,
    walletBankName: row.wallet_bank_name || profile?.wallet_bank_name || null,
    walletBankAccountNumber: row.wallet_bank_account_number || profile?.wallet_bank_account_number || null,
    walletBankAccountName: row.wallet_bank_account_name || profile?.wallet_bank_account_name || null,
  };
}

export default router;
