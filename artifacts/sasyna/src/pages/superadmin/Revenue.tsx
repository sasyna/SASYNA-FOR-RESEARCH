import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useGetRevenue } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import {
  DollarSign, TrendingUp, CreditCard, Loader2, Calendar, Download, Sparkles,
  Wallet, ArrowDownCircle, ShieldCheck, AlertCircle, Clock, CheckCircle2,
  XCircle, ChevronDown, ChevronUp, Receipt, Plus, RefreshCw, Users,
} from "lucide-react";
import { exportToPdf } from "@/lib/exportPdf";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Period = "today" | "last30days" | "lastmonth" | "alltime" | "custom";

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "last30days", label: "Last 30 Days" },
  { value: "lastmonth", label: "Last Month" },
  { value: "alltime", label: "All Time" },
  { value: "custom", label: "Custom Range" },
];

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.08, ease: EASE } }),
};
const scaleIn = {
  hidden: { opacity: 0, scale: 0.88 },
  show: (i: number) => ({ opacity: 1, scale: 1, transition: { duration: 0.45, delay: i * 0.1, ease: EASE } }),
};

function Orbs() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
      <div className="absolute -top-32 -right-32 w-[480px] h-[480px] rounded-full bg-emerald-600/8 blur-[100px] animate-pulse" style={{ animationDuration: "7s" }} />
      <div className="absolute bottom-0 -left-20 w-[400px] h-[400px] rounded-full bg-violet-500/7 blur-[110px] animate-pulse" style={{ animationDuration: "9s", animationDelay: "3s" }} />
      <div className="absolute inset-0 opacity-[0.02]"
        style={{ backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
    </div>
  );
}

type SuperadminStatus = {
  id: string;
  name: string;
  email: string;
  action: "approved" | "rejected" | "pending";
  note?: string | null;
  votedAt?: string | null;
};

type Deduction = {
  id: string;
  amount: number;
  reason: string;
  status: "pending_approval" | "approved" | "rejected";
  submittedByName: string;
  totalSuperadminsRequired: number;
  createdAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectedByName?: string;
  rejectedReason?: string;
  superadminStatuses: SuperadminStatus[];
  approvals: {
    id: string;
    superadminId: string;
    superadminName: string;
    action: string;
    note?: string;
    createdAt: string;
  }[];
};

function statusBadge(status: string) {
  if (status === "approved") return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400"><CheckCircle2 className="w-3 h-3" />Approved</span>;
  if (status === "rejected") return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/15 text-red-400"><XCircle className="w-3 h-3" />Rejected</span>;
  return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400"><Clock className="w-3 h-3" />Pending Approval</span>;
}

function DeductionReceiptPdf(deduction: Deduction) {
  const BRAND: [number, number, number] = [99, 102, 241];
  const DARK: [number, number, number] = [15, 15, 30];
  const MID: [number, number, number] = [90, 90, 110];
  const LIGHT: [number, number, number] = [245, 245, 252];

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const now = new Date();

  // Header
  doc.setFillColor(30, 30, 46);
  doc.rect(0, 0, pageW, 32, "F");
  doc.setFillColor(...BRAND);
  doc.roundedRect(10, 7, 16, 16, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("S", 18, 16.5, { align: "center" });
  doc.setFontSize(15);
  doc.text("Sasyna", 30, 14);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 180, 200);
  doc.text("The World of Research", 30, 20);

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("Deduction Receipt", pageW / 2, 14, { align: "center" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(200, 200, 220);
  doc.text(`System Revenue Audit Record`, pageW / 2, 21, { align: "center" });

  doc.setFontSize(7.5);
  doc.setTextColor(160, 160, 180);
  doc.text(`Generated: ${now.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })} at ${now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`, pageW - 10, 18, { align: "right" });

  // Status banner
  const statusColor: [number, number, number] = deduction.status === "approved" ? [16, 185, 129] : deduction.status === "rejected" ? [239, 68, 68] : [245, 158, 11];
  doc.setFillColor(...statusColor);
  doc.roundedRect(10, 37, pageW - 20, 12, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  const statusLabel = deduction.status === "approved" ? "✓ APPROVED" : deduction.status === "rejected" ? "✗ REJECTED" : "⏳ PENDING APPROVAL";
  doc.text(statusLabel, pageW / 2, 44.5, { align: "center" });

  // Deduction details box
  doc.setFillColor(...LIGHT);
  doc.roundedRect(10, 55, pageW - 20, 70, 4, 4, "F");
  doc.setDrawColor(220, 220, 230);
  doc.setLineWidth(0.3);
  doc.roundedRect(10, 55, pageW - 20, 70, 4, 4, "S");

  const field = (label: string, value: string, y: number) => {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MID);
    doc.text(label, 16, y);
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK);
    doc.text(value, 16, y + 5);
  };

  field("Receipt ID", deduction.id.substring(0, 18) + "...", 63);
  field("Amount", `KES ${Number(deduction.amount).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`, 77);
  field("Submitted By", deduction.submittedByName || "—", 91);
  field("Submitted Date", deduction.createdAt ? new Date(deduction.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }) : "—", 105);

  // Amount highlighted
  doc.setFillColor(...BRAND);
  doc.roundedRect(pageW - 80, 57, 68, 22, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("DEDUCTION AMOUNT", pageW - 46, 63, { align: "center" });
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(`KES ${Number(deduction.amount).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`, pageW - 46, 73, { align: "center" });

  // Reason
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(10, 132, pageW - 20, 28, 4, 4, "F");
  doc.setDrawColor(220, 220, 230);
  doc.roundedRect(10, 132, pageW - 20, 28, 4, 4, "S");
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MID);
  doc.text("REASON / PURPOSE", 16, 140);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK);
  const reasonLines = doc.splitTextToSize(deduction.reason || "—", pageW - 36);
  doc.text(reasonLines.slice(0, 2), 16, 147);

  // Approvals table
  const approvalVotes = deduction.approvals.filter(a => a.action === "approved" || a.action === "rejected");
  if (approvalVotes.length > 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK);
    doc.text("Approval Audit Log", 10, 172);

    autoTable(doc, {
      head: [["Superadmin", "Action", "Note", "Date"]],
      body: approvalVotes.map(a => [
        a.superadminName || "—",
        a.action.toUpperCase(),
        a.note || "—",
        new Date(a.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      ]),
      startY: 176,
      margin: { left: 10, right: 10 },
      headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: DARK },
      alternateRowStyles: { fillColor: LIGHT },
    });
  }

  // Footer
  const fY = doc.internal.pageSize.getHeight() - 12;
  doc.setFillColor(30, 30, 46);
  doc.rect(0, fY - 2, pageW, 20, "F");
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 180, 200);
  doc.text(`© ${now.getFullYear()} Sasyna — The World of Research  ·  System Revenue Deduction Receipt`, pageW / 2, fY + 4, { align: "center" });
  doc.text(`Approvals required: ${deduction.totalSuperadminsRequired}  |  Approvals received: ${approvalVotes.filter(a => a.action === "approved").length}`, pageW / 2, fY + 10, { align: "center" });

  doc.save(`sasyna-deduction-${deduction.id.substring(0, 8)}.pdf`);
}

export default function SuperAdminRevenue() {
  const [period, setPeriod] = useState<Period>("alltime");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedParams, setAppliedParams] = useState<{ period: Period; startDate?: string; endDate?: string }>({ period: "alltime" });

  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [deductionsLoading, setDeductionsLoading] = useState(false);
  const [deductionsLoaded, setDeductionsLoaded] = useState(false);
  const [showDeductions, setShowDeductions] = useState(false);
  const [showDeductionForm, setShowDeductionForm] = useState(false);
  const [deductionAmount, setDeductionAmount] = useState("");
  const [deductionReason, setDeductionReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [expandedDeduction, setExpandedDeduction] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [approveNote, setApproveNote] = useState<Record<string, string>>({});
  const [voteError, setVoteError] = useState<Record<string, string>>({});
  const [newDeductionId, setNewDeductionId] = useState<string | null>(null);

  const { data: revenue, isLoading, refetch: refetchRevenue } = useGetRevenue(
    appliedParams.period === "custom"
      ? { period: appliedParams.period, startDate: appliedParams.startDate, endDate: appliedParams.endDate }
      : { period: appliedParams.period }
  );

  const handlePeriodChange = (p: Period) => {
    setPeriod(p);
    if (p !== "custom") setAppliedParams({ period: p });
  };

  const handleApply = () => {
    if (!startDate || !endDate) return;
    setAppliedParams({ period: "custom", startDate, endDate });
  };

  const getAuthHeader = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  };

  const loadDeductions = async () => {
    setDeductionsLoading(true);
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch("/api/superadmin/revenue/deductions", { headers: authHeader });
      const data = await res.json();
      setDeductions(Array.isArray(data) ? data : []);
      setDeductionsLoaded(true);
    } catch {
      setDeductions([]);
    } finally {
      setDeductionsLoading(false);
    }
  };

  const handleToggleDeductions = () => {
    const next = !showDeductions;
    setShowDeductions(next);
    if (next && !deductionsLoaded) loadDeductions();
  };

  const handleSubmitDeduction = async () => {
    setSubmitError("");
    const amount = parseFloat(deductionAmount);
    if (!amount || amount <= 0) { setSubmitError("Enter a valid amount greater than 0."); return; }
    if (!deductionReason.trim()) { setSubmitError("Please provide a reason for this deduction."); return; }
    setSubmitting(true);
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch("/api/superadmin/revenue/deductions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ amount, reason: deductionReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setSubmitError(data.error || "Failed to record deduction."); return; }
      setDeductionAmount("");
      setDeductionReason("");
      setShowDeductionForm(false);
      setShowDeductions(true);
      setNewDeductionId(data.id);
      setExpandedDeduction(data.id);
      await loadDeductions();
      refetchRevenue();
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVote = async (deductionId: string, action: "approved" | "rejected") => {
    const note = approveNote[deductionId] || "";
    if (action === "rejected" && !note.trim()) {
      setVoteError(e => ({ ...e, [deductionId]: "Please enter a reason before rejecting." }));
      return;
    }
    setVoteError(e => ({ ...e, [deductionId]: "" }));
    setApproving(deductionId);
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch(`/api/superadmin/revenue/deductions/${deductionId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ action, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVoteError(e => ({ ...e, [deductionId]: data.error || "Action failed." }));
      } else {
        await loadDeductions();
        refetchRevenue();
        setApproveNote(n => ({ ...n, [deductionId]: "" }));
      }
    } catch {
      setVoteError(e => ({ ...e, [deductionId]: "Network error. Please try again." }));
    } finally {
      setApproving(null);
    }
  };

  const rev = revenue as (typeof revenue & {
    systemRevenue?: number;
    paidWithdrawals?: number;
    unpaidWithdrawals?: number;
    totalApprovedDeductions?: number;
    netProfit?: number;
    totalRefunds?: number;
    totalResearcherWalletBalances?: number;
    totalLockedAdminEarnings?: number;
    totalPendingDisbursement?: number;
    unclaimedOrdersRevenue?: number;
    trueSystemRevenue?: number;
  }) | undefined;

  const chartData = [
    { name: "Deposits", amount: rev?.totalDeposits || 0, color: "#6366f1" },
    { name: "Balances", amount: rev?.totalBalances || 0, color: "#8b5cf6" },
    ...((rev?.totalRefunds || 0) > 0 ? [{ name: "Refunds", amount: rev?.totalRefunds || 0, color: "#ef4444" }] : []),
    { name: "Net Total", amount: rev?.totalRevenue || 0, color: "#10b981" },
  ];

  const topStatCards = [
    {
      label: "Final System Revenue",
      value: rev?.trueSystemRevenue ?? 0,
      sub: "Net profit − disbursement − locked earnings − 50% unclaimed",
      icon: ShieldCheck,
      gradient: "from-cyan-500/20 via-sky-500/10 to-transparent",
      glow: "shadow-cyan-500/20", ring: "ring-cyan-500/30",
      iconBg: "bg-cyan-500/15", iconColor: "text-cyan-400",
    },
    {
      label: "Gross Revenue",
      value: rev?.totalRevenue || 0,
      sub: "Payments minus refunds",
      icon: TrendingUp,
      gradient: "from-emerald-500/20 via-teal-500/10 to-transparent",
      glow: "shadow-emerald-500/20", ring: "ring-emerald-500/30",
      iconBg: "bg-emerald-500/15", iconColor: "text-emerald-400",
    },
    {
      label: "System Revenue",
      value: rev?.systemRevenue ?? 0,
      sub: "After paid researcher withdrawals",
      icon: ShieldCheck,
      gradient: "from-indigo-500/20 via-blue-500/10 to-transparent",
      glow: "shadow-indigo-500/20", ring: "ring-indigo-500/30",
      iconBg: "bg-indigo-500/15", iconColor: "text-indigo-400",
    },
    {
      label: "Net Profit",
      value: rev?.netProfit ?? 0,
      sub: "After approved deductions",
      icon: Sparkles,
      gradient: "from-violet-500/20 via-purple-500/10 to-transparent",
      glow: "shadow-violet-500/20", ring: "ring-violet-500/30",
      iconBg: "bg-violet-500/15", iconColor: "text-violet-400",
    },
  ];

  const bottomStatCards = [
    {
      label: "Total Deposits",
      value: rev?.totalDeposits || 0,
      sub: "Initial order deposits",
      icon: CreditCard,
      gradient: "from-sky-500/15 via-blue-500/8 to-transparent",
      glow: "shadow-sky-500/15", ring: "ring-sky-500/20",
      iconBg: "bg-sky-500/15", iconColor: "text-sky-400",
    },
    {
      label: "Total Balances",
      value: rev?.totalBalances || 0,
      sub: "Final balance payments",
      icon: DollarSign,
      gradient: "from-teal-500/15 via-emerald-500/8 to-transparent",
      glow: "shadow-teal-500/15", ring: "ring-teal-500/20",
      iconBg: "bg-teal-500/15", iconColor: "text-teal-400",
    },
    {
      label: "Paid to Researchers",
      value: rev?.paidWithdrawals ?? 0,
      sub: "Paid in selected period",
      icon: Wallet,
      gradient: "from-orange-500/15 via-amber-500/8 to-transparent",
      glow: "shadow-orange-500/15", ring: "ring-orange-500/20",
      iconBg: "bg-orange-500/15", iconColor: "text-orange-400",
    },
    {
      label: "Unpaid Withdrawals",
      value: rev?.unpaidWithdrawals ?? 0,
      sub: "Pending + approved (owed)",
      icon: Clock,
      gradient: "from-amber-500/15 via-yellow-500/8 to-transparent",
      glow: "shadow-amber-500/15", ring: "ring-amber-500/20",
      iconBg: "bg-amber-500/15", iconColor: "text-amber-400",
    },
    {
      label: "Total Refunds",
      value: rev?.totalRefunds ?? 0,
      sub: "Refunded to students",
      icon: ArrowDownCircle,
      gradient: "from-rose-500/15 via-red-500/8 to-transparent",
      glow: "shadow-rose-500/15", ring: "ring-rose-500/20",
      iconBg: "bg-rose-500/15", iconColor: "text-rose-400",
    },
    {
      label: "Approved Deductions",
      value: rev?.totalApprovedDeductions ?? 0,
      sub: "System expenses recorded",
      icon: ArrowDownCircle,
      gradient: "from-red-500/15 via-rose-500/8 to-transparent",
      glow: "shadow-red-500/15", ring: "ring-red-500/20",
      iconBg: "bg-red-500/15", iconColor: "text-red-400",
    },
    {
      label: "Locked Admin Earnings",
      value: rev?.totalLockedAdminEarnings ?? 0,
      sub: "Reserved, pending order completion",
      icon: Users,
      gradient: "from-fuchsia-500/15 via-pink-500/8 to-transparent",
      glow: "shadow-fuchsia-500/15", ring: "ring-fuchsia-500/20",
      iconBg: "bg-fuchsia-500/15", iconColor: "text-fuchsia-400",
    },
  ];

  const handleExportFull = () => {
    if (!rev) return;
    const summaryRows = [
      { category: "Total Deposits (Gross)", amount: formatCurrency((rev.totalDeposits || 0) + (rev.totalRefunds || 0)), note: "All deposit payments before refunds" },
      { category: "Total Balances", amount: formatCurrency(rev.totalBalances || 0), note: "Final balance payments" },
      { category: "Total Refunds (−)", amount: formatCurrency(rev.totalRefunds ?? 0), note: "Refunded deposit amounts deducted" },
      { category: "Net Revenue", amount: formatCurrency(rev.totalRevenue || 0), note: "Deposits + Balances − Refunds" },
      { category: "Paid to Researchers", amount: formatCurrency(rev.paidWithdrawals ?? 0), note: "Confirmed paid withdrawals" },
      { category: "Unpaid Withdrawals", amount: formatCurrency(rev.unpaidWithdrawals ?? 0), note: "Pending + approved (owed)" },
      { category: "System Revenue", amount: formatCurrency(rev.systemRevenue ?? 0), note: "Net Revenue − Paid Withdrawals" },
      { category: "Approved Deductions", amount: formatCurrency(rev.totalApprovedDeductions ?? 0), note: "Recorded system expenses" },
      { category: "NET PROFIT", amount: formatCurrency(rev.netProfit ?? 0), note: "System Revenue − Deductions" },
      { category: "Locked Admin Earnings (−)", amount: formatCurrency(rev.totalLockedAdminEarnings ?? 0), note: "Reserved for admins pending order completion" },
    ];
    const adminRows = (rev.adminBreakdown || []).map((a: any) => ({
      category: `Researcher: ${a.adminName}`,
      amount: formatCurrency(a.totalRevenue),
      note: `${a.completedOrders} orders`,
    }));
    exportToPdf({
      title: "Revenue Analytics Report",
      subtitle: `Period: ${rev.periodLabel || appliedParams.period}  ·  Exported ${new Date().toLocaleDateString("en-GB")}`,
      filename: `sasyna-revenue-report-${new Date().toISOString().slice(0, 10)}.pdf`,
      columns: [
        { header: "Category", dataKey: "category" },
        { header: "Amount", dataKey: "amount" },
        { header: "Notes", dataKey: "note" },
      ],
      rows: [...summaryRows, ...(adminRows.length ? [{ category: "─── Researcher Breakdown ───", amount: "", note: "" }, ...adminRows] : [])],
    });
  };

  return (
    <DashboardLayout>
      <Orbs />

      {/* Header */}
      <motion.div variants={fadeUp} custom={0} initial="hidden" animate="show" className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Financial Audit</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">Revenue Analytics</h1>
          <p className="mt-1.5 text-muted-foreground">Track platform income, profit, spendings, and researcher payouts.</p>
        </div>
        {!isLoading && rev && (
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleExportFull}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border bg-card/60 backdrop-blur-sm text-foreground font-medium text-sm hover:bg-muted/60 transition-all shadow-sm">
            <Download className="w-4 h-4" /> Export Full PDF
          </motion.button>
        )}
      </motion.div>

      {/* Period Filter */}
      <motion.div variants={fadeUp} custom={1} initial="hidden" animate="show"
        className="bg-card/60 backdrop-blur-sm border border-border rounded-2xl shadow-lg ring-1 ring-border/50 p-5 mb-8">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Period</label>
            <div className="flex flex-wrap gap-2">
              {PERIOD_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => handlePeriodChange(opt.value)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${period === opt.value ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "bg-muted/60 text-muted-foreground hover:bg-muted"}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {period === "custom" && (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">From</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">To</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" />
              </div>
              <button onClick={handleApply} disabled={!startDate || !endDate}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center gap-2 shadow-md shadow-primary/25">
                <Calendar className="w-4 h-4" /> Apply
              </button>
            </div>
          )}
        </div>
        {rev?.periodLabel && (
          <p className="mt-3 text-sm text-muted-foreground">Showing: <span className="font-semibold text-foreground">{rev.periodLabel}</span>
            <span className="ml-2 text-xs text-muted-foreground/60">* Unpaid withdrawals &amp; deductions are always all-time · Paid to Researchers follows the selected period</span>
          </p>
        )}
      </motion.div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-500 animate-spin" />
          </div>
          <p className="text-muted-foreground text-sm">Loading financial data…</p>
        </div>
      ) : (
        <>
          {/* Final System Revenue — full-width hero card */}
          <motion.div variants={scaleIn} custom={0} initial="hidden" animate="show" whileHover={{ y: -4, scale: 1.01 }}
            className="relative overflow-hidden rounded-2xl border bg-card/60 backdrop-blur-sm p-5 sm:p-6 shadow-xl ring-1 shadow-cyan-500/25 ring-cyan-500/35 mb-4">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 via-sky-500/10 to-transparent pointer-events-none" />
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-cyan-500/15 shrink-0">
                  <ShieldCheck className="w-6 h-6 text-cyan-400" />
                </div>
                <div>
                  <div className="text-[11px] sm:text-xs font-semibold uppercase tracking-widest text-cyan-400 mb-0.5">Platform Bottom Line</div>
                  <div className="text-3xl sm:text-4xl font-extrabold text-foreground leading-none break-all">
                    {formatCurrency(rev?.trueSystemRevenue ?? 0)}
                  </div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-1">Final System Revenue</div>
                  <div className="text-[10px] text-muted-foreground/70 mt-0.5">Net profit − pending disbursement − locked admin earnings − 50% of unclaimed orders</div>
                </div>
              </div>
              <div className="flex items-center gap-1 text-[10px] sm:text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full self-start">
                <TrendingUp className="w-2.5 h-2.5" /> Live
              </div>
            </div>
          </motion.div>

          {/* Secondary KPI cards — Gross Revenue, System Revenue, Net Profit */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            {topStatCards.slice(1).map((stat, i) => (
              <motion.div key={stat.label} variants={scaleIn} custom={i + 1} initial="hidden" animate="show" whileHover={{ y: -4, scale: 1.02 }}
                className={`relative overflow-hidden rounded-2xl border bg-card/60 backdrop-blur-sm p-5 shadow-xl ring-1 ${stat.glow} ${stat.ring}`}>
                <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} pointer-events-none`} />
                <div className="relative flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${stat.iconBg}`}>
                    <stat.icon className={`w-6 h-6 ${stat.iconColor}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-2xl font-extrabold text-foreground">{formatCurrency(stat.value)}</div>
                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-0.5">{stat.label}</div>
                    <div className="text-xs text-muted-foreground/70 mt-0.5 truncate">{stat.sub}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* 6 secondary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            {bottomStatCards.map((stat, i) => (
              <motion.div key={stat.label} variants={scaleIn} custom={i + 3} initial="hidden" animate="show" whileHover={{ y: -3, scale: 1.015 }}
                className={`relative overflow-hidden rounded-xl border bg-card/60 backdrop-blur-sm p-4 shadow-md ring-1 ${stat.glow} ${stat.ring}`}>
                <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} pointer-events-none`} />
                <div className="relative">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${stat.iconBg}`}>
                    <stat.icon className={`w-4 h-4 ${stat.iconColor}`} />
                  </div>
                  <div className="text-lg font-extrabold text-foreground leading-tight">{formatCurrency(stat.value)}</div>
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-1 leading-tight">{stat.label}</div>
                  <div className="text-xs text-muted-foreground/60 mt-0.5 leading-tight">{stat.sub}</div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Ownership / Liability breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {/* Pending Disbursement — total owed to researchers */}
            <motion.div variants={scaleIn} custom={10} initial="hidden" animate="show" whileHover={{ y: -4, scale: 1.02 }}
              className="relative overflow-hidden rounded-2xl border bg-card/60 backdrop-blur-sm p-5 shadow-xl ring-1 shadow-amber-500/20 ring-amber-500/30">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-transparent pointer-events-none" />
              <div className="relative flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-amber-500/15">
                  <AlertCircle className="w-6 h-6 text-amber-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-2xl font-extrabold text-foreground">{formatCurrency(rev?.totalPendingDisbursement ?? 0)}</div>
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-0.5">Pending Disbursement</div>
                  <div className="text-xs text-muted-foreground/70 mt-0.5">Researcher wallets ({formatCurrency(rev?.totalResearcherWalletBalances ?? 0)}) + pending/approved withdrawal requests ({formatCurrency(rev?.unpaidWithdrawals ?? 0)})</div>
                </div>
              </div>
            </motion.div>

            {/* Unclaimed Orders Revenue */}
            <motion.div variants={scaleIn} custom={11} initial="hidden" animate="show" whileHover={{ y: -4, scale: 1.02 }}
              className="relative overflow-hidden rounded-2xl border bg-card/60 backdrop-blur-sm p-5 shadow-xl ring-1 shadow-rose-500/20 ring-rose-500/30">
              <div className="absolute inset-0 bg-gradient-to-br from-rose-500/20 via-pink-500/10 to-transparent pointer-events-none" />
              <div className="relative flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-rose-500/15">
                  <Clock className="w-6 h-6 text-rose-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-2xl font-extrabold text-foreground">{formatCurrency(rev?.unclaimedOrdersRevenue ?? 0)}</div>
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-0.5">Unclaimed Orders</div>
                  <div className="text-xs text-muted-foreground/70 mt-0.5">Payments received for orders awaiting researcher assignment</div>
                </div>
              </div>
            </motion.div>

            {/* Final System Revenue — what truly belongs to the platform */}
            <motion.div variants={scaleIn} custom={12} initial="hidden" animate="show" whileHover={{ y: -4, scale: 1.02 }}
              className="relative overflow-hidden rounded-2xl border bg-card/60 backdrop-blur-sm p-5 shadow-xl ring-1 shadow-cyan-500/20 ring-cyan-500/30">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 via-sky-500/10 to-transparent pointer-events-none" />
              <div className="relative flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-cyan-500/15">
                  <ShieldCheck className="w-6 h-6 text-cyan-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-2xl font-extrabold text-foreground">{formatCurrency(rev?.trueSystemRevenue ?? 0)}</div>
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-0.5">Final System Revenue</div>
                  <div className="text-xs text-muted-foreground/70 mt-0.5">Net profit − pending disbursement − locked admin earnings − 50% of unclaimed orders</div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Charts & Researcher breakdown */}
          <div className="grid lg:grid-cols-2 gap-6 mb-8">
            <motion.div variants={fadeUp} custom={9} initial="hidden" animate="show"
              className="bg-card/60 backdrop-blur-sm border border-border rounded-2xl shadow-lg ring-1 ring-border/50 p-6 sm:p-7">
              <h2 className="text-lg font-bold text-foreground mb-6">Revenue Breakdown</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barSize={52}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 13 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: number) => [formatCurrency(v), "Amount"]}
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "12px", color: "hsl(var(--foreground))" }} />
                    <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                      {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            <motion.div variants={fadeUp} custom={10} initial="hidden" animate="show"
              className="bg-card/60 backdrop-blur-sm border border-border rounded-2xl shadow-lg ring-1 ring-border/50 p-6 sm:p-7">
              <h2 className="text-lg font-bold text-foreground mb-6">Revenue per Researcher</h2>
              {!rev?.adminBreakdown?.length ? (
                <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">No data for this period.</div>
              ) : (
                <div className="space-y-2 overflow-y-auto max-h-64 pr-1">
                  {rev.adminBreakdown.map((admin: any, i: number) => (
                    <div key={i} className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                          {admin.adminName?.charAt(0).toUpperCase() || "R"}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground text-sm">{admin.adminName}</div>
                          <div className="text-xs text-muted-foreground">{admin.completedOrders} orders</div>
                        </div>
                      </div>
                      <div className="font-extrabold text-emerald-400">{formatCurrency(admin.totalRevenue)}</div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>

          {/* ── System Revenue Deductions Section ── */}
          <motion.div variants={fadeUp} custom={11} initial="hidden" animate="show" className="mb-8">
            <div className="bg-card/60 backdrop-blur-sm border border-border rounded-2xl shadow-lg ring-1 ring-border/50 overflow-hidden">

              {/* Section header */}
              <div className="flex items-center justify-between p-6 border-b border-border/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center">
                    <ArrowDownCircle className="w-5 h-5 text-red-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-foreground">System Deductions</h2>
                    <p className="text-xs text-muted-foreground">Record expenses and withdrawals from system revenue — requires all super-admin approval</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setShowDeductionForm(f => !f); setSubmitError(""); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-md shadow-primary/25 hover:bg-primary/90 transition-all">
                    <Plus className="w-4 h-4" /> Record Deduction
                  </button>
                  <button onClick={handleToggleDeductions}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-muted/40 text-muted-foreground text-sm font-medium hover:bg-muted transition-all">
                    {showDeductions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    {showDeductions ? "Hide" : "View History"}
                  </button>
                </div>
              </div>

              {/* Deduction form */}
              <AnimatePresence>
                {showDeductionForm && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }}>
                    <div className="p-6 border-b border-border/50 bg-muted/20">
                      <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-amber-400" />
                        Record a System Deduction
                        <span className="text-xs font-normal text-muted-foreground ml-1">— Requires all super-admin approvals before it's applied</span>
                      </h3>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Amount (KES)</label>
                          <input
                            type="number" min="1" step="0.01"
                            value={deductionAmount}
                            onChange={e => setDeductionAmount(e.target.value)}
                            placeholder="e.g. 5000"
                            className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Reason / Purpose</label>
                          <input
                            type="text"
                            value={deductionReason}
                            onChange={e => setDeductionReason(e.target.value)}
                            placeholder="e.g. Server hosting payment - March 2026"
                            className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                          />
                        </div>
                      </div>
                      {submitError && (
                        <div className="mt-3 flex items-center gap-2 text-sm text-red-400">
                          <AlertCircle className="w-4 h-4 shrink-0" /> {submitError}
                        </div>
                      )}
                      <div className="mt-4 flex gap-3">
                        <button onClick={handleSubmitDeduction} disabled={submitting}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-md shadow-primary/25 hover:bg-primary/90 transition-all disabled:opacity-60">
                          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
                          {submitting ? "Recording…" : "Record Deduction"}
                        </button>
                        <button onClick={() => { setShowDeductionForm(false); setSubmitError(""); setDeductionAmount(""); setDeductionReason(""); }}
                          className="px-4 py-2.5 rounded-xl border border-border bg-muted/40 text-muted-foreground text-sm font-medium hover:bg-muted transition-all">
                          Cancel
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Deductions history */}
              <AnimatePresence>
                {showDeductions && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }}>
                    <div className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-foreground">Deduction History</h3>
                        <button onClick={loadDeductions} disabled={deductionsLoading}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                          <RefreshCw className={`w-3.5 h-3.5 ${deductionsLoading ? "animate-spin" : ""}`} /> Refresh
                        </button>
                      </div>

                      {deductionsLoading ? (
                        <div className="flex items-center justify-center py-10 gap-3 text-muted-foreground text-sm">
                          <Loader2 className="w-5 h-5 animate-spin" /> Loading deductions…
                        </div>
                      ) : deductions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center mb-3">
                            <Receipt className="w-6 h-6 text-muted-foreground/50" />
                          </div>
                          <p className="text-sm text-muted-foreground">No deductions recorded yet.</p>
                          <p className="text-xs text-muted-foreground/60 mt-1">Use the "Record Deduction" button to add one.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {deductions.map((d) => {
                            const isExpanded = expandedDeduction === d.id;
                            const isNew = newDeductionId === d.id;
                            const saStatuses = d.superadminStatuses || [];
                            const approvedCount = saStatuses.filter(s => s.action === "approved").length;
                            const total = saStatuses.length;
                            const progressPct = total > 0 ? Math.round((approvedCount / total) * 100) : 0;

                            return (
                              <motion.div key={d.id}
                                initial={isNew ? { opacity: 0, y: -12, scale: 0.98 } : false}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                                className={`rounded-2xl overflow-hidden transition-all ${
                                  d.status === "approved"
                                    ? "border border-emerald-500/30 bg-emerald-500/5 shadow-lg shadow-emerald-500/10"
                                    : d.status === "rejected"
                                    ? "border border-red-500/30 bg-red-500/5 shadow-lg shadow-red-500/10"
                                    : isNew
                                    ? "border border-primary/40 bg-primary/5 shadow-lg shadow-primary/15"
                                    : "border border-border/60 bg-card/40"
                                }`}>

                                {/* Card header */}
                                <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/10 transition-colors"
                                  onClick={() => setExpandedDeduction(isExpanded ? null : d.id)}>
                                  <div className="flex items-center gap-3 min-w-0 flex-1">
                                    {/* Amount badge */}
                                    <div className={`shrink-0 w-12 h-12 rounded-xl flex flex-col items-center justify-center text-center font-black leading-tight ${
                                      d.status === "approved" ? "bg-emerald-500/15 text-emerald-400" :
                                      d.status === "rejected" ? "bg-red-500/15 text-red-400" :
                                      "bg-primary/15 text-primary"
                                    }`}>
                                      <ArrowDownCircle className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-base font-extrabold text-foreground">{formatCurrency(d.amount)}</span>
                                        {statusBadge(d.status)}
                                        {isNew && d.status === "pending_approval" && (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-primary/20 text-primary">
                                            <Sparkles className="w-3 h-3" /> Just submitted
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-sm text-muted-foreground mt-0.5 leading-snug truncate">{d.reason}</div>
                                      <div className="text-xs text-muted-foreground/60 mt-0.5">
                                        Submitted by <span className="font-semibold text-muted-foreground">{d.submittedByName}</span> · {new Date(d.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 ml-4 shrink-0">
                                    <button onClick={(e) => { e.stopPropagation(); DeductionReceiptPdf(d); }}
                                      className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/40 text-muted-foreground text-xs font-medium hover:bg-muted hover:text-foreground transition-all">
                                      <Receipt className="w-3.5 h-3.5" /> Receipt
                                    </button>
                                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                                  </div>
                                </div>

                                {/* Progress bar (pending only) */}
                                {d.status === "pending_approval" && total > 0 && (
                                  <div className="px-4 pb-3">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-xs text-muted-foreground">{approvedCount} of {total} approved</span>
                                      <span className="text-xs font-bold text-primary">{progressPct}%</span>
                                    </div>
                                    <div className="w-full h-1.5 rounded-full bg-muted/50 overflow-hidden">
                                      <motion.div className="h-full rounded-full bg-primary"
                                        initial={{ width: 0 }} animate={{ width: `${progressPct}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
                                    </div>
                                  </div>
                                )}

                                {/* Expanded panel */}
                                <AnimatePresence>
                                  {isExpanded && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }}>
                                      <div className="border-t border-border/50 p-5 space-y-5 bg-muted/5">

                                        {/* ── Super-admin approval board ── */}
                                        <div>
                                          <div className="flex items-center gap-2 mb-3">
                                            <Users className="w-4 h-4 text-muted-foreground" />
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Super-admin Approval Status</h4>
                                          </div>
                                          {saStatuses.length === 0 ? (
                                            <p className="text-xs text-muted-foreground/60">No super-admins found.</p>
                                          ) : (
                                            <div className="grid sm:grid-cols-2 gap-2">
                                              {saStatuses.map((sa) => (
                                                <div key={sa.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                                                  sa.action === "approved"
                                                    ? "bg-emerald-500/10 border-emerald-500/25"
                                                    : sa.action === "rejected"
                                                    ? "bg-red-500/10 border-red-500/25"
                                                    : "bg-muted/30 border-border/50"
                                                }`}>
                                                  {/* Avatar */}
                                                  <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-sm font-extrabold ${
                                                    sa.action === "approved" ? "bg-emerald-500/20 text-emerald-400" :
                                                    sa.action === "rejected" ? "bg-red-500/20 text-red-400" :
                                                    "bg-muted text-muted-foreground"
                                                  }`}>
                                                    {(sa.name || sa.email || "?").charAt(0).toUpperCase()}
                                                  </div>
                                                  <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5">
                                                      <span className="text-sm font-semibold text-foreground truncate">{sa.name}</span>
                                                      {sa.action === "approved" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                                                      {sa.action === "rejected" && <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                                                      {sa.action === "pending" && <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground truncate">{sa.email}</div>
                                                    {sa.action === "approved" && sa.votedAt && (
                                                      <div className="text-xs text-emerald-500/70 mt-0.5">Approved · {new Date(sa.votedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</div>
                                                    )}
                                                    {sa.action === "rejected" && (
                                                      <div className="text-xs text-red-400 mt-0.5 font-medium">
                                                        Rejected{sa.votedAt ? ` · ${new Date(sa.votedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}` : ""}
                                                        {sa.note && <span className="block text-red-400/80 mt-0.5 italic">"{sa.note}"</span>}
                                                      </div>
                                                    )}
                                                    {sa.action === "pending" && (
                                                      <div className="text-xs text-amber-500/70 mt-0.5">Awaiting decision</div>
                                                    )}
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>

                                        {/* ── Final status messages ── */}
                                        {d.status === "approved" && d.approvedAt && (
                                          <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                                            <div>
                                              <p className="text-sm font-bold text-emerald-400">Fully Approved & Applied</p>
                                              <p className="text-xs text-emerald-400/70 mt-0.5">
                                                All {total} super-admins approved this deduction on {new Date(d.approvedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}.
                                                {formatCurrency(d.amount)} has been deducted from system revenue.
                                              </p>
                                            </div>
                                          </div>
                                        )}

                                        {d.status === "rejected" && (
                                          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                                            <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                                            <div>
                                              <p className="text-sm font-bold text-red-400">Deduction Rejected</p>
                                              {d.rejectedByName && (
                                                <p className="text-xs text-red-400/80 mt-0.5">
                                                  Rejected by <span className="font-semibold">{d.rejectedByName}</span>
                                                  {d.rejectedReason && <> — <span className="italic">"{d.rejectedReason}"</span></>}
                                                </p>
                                              )}
                                              <p className="text-xs text-red-400/60 mt-1">This deduction has not been applied to system revenue.</p>
                                            </div>
                                          </div>
                                        )}

                                        {/* ── Vote panel (pending only) ── */}
                                        {d.status === "pending_approval" && (
                                          <div className="p-4 rounded-xl bg-muted/20 border border-border/50">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                                              <ShieldCheck className="w-3.5 h-3.5" /> Cast Your Vote
                                            </h4>
                                            <div className="mb-3">
                                              <label className="block text-xs text-muted-foreground mb-1.5">
                                                Note <span className="text-red-400">*required if rejecting</span>
                                              </label>
                                              <input
                                                type="text"
                                                value={approveNote[d.id] || ""}
                                                onChange={e => { setApproveNote(n => ({ ...n, [d.id]: e.target.value })); setVoteError(er => ({ ...er, [d.id]: "" })); }}
                                                placeholder="Add a note (required to reject)..."
                                                className={`w-full px-3 py-2.5 rounded-xl border bg-background text-foreground text-sm outline-none focus:ring-2 transition-all ${voteError[d.id] ? "border-red-500 focus:ring-red-500/20" : "border-border focus:border-primary focus:ring-primary/20"}`}
                                              />
                                              {voteError[d.id] && (
                                                <p className="flex items-center gap-1 text-xs text-red-400 mt-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{voteError[d.id]}</p>
                                              )}
                                            </div>
                                            <div className="flex gap-2">
                                              <button disabled={approving === d.id} onClick={() => handleVote(d.id, "approved")}
                                                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-400 transition-all disabled:opacity-60 shadow-md shadow-emerald-500/20">
                                                {approving === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                                Approve Deduction
                                              </button>
                                              <button disabled={approving === d.id} onClick={() => handleVote(d.id, "rejected")}
                                                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-400 transition-all disabled:opacity-60 shadow-md shadow-red-500/20">
                                                {approving === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                                                Reject Deduction
                                              </button>
                                            </div>
                                          </div>
                                        )}

                                        {/* ── Receipt button (mobile) ── */}
                                        <div className="sm:hidden pt-1">
                                          <button onClick={() => DeductionReceiptPdf(d)}
                                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border bg-muted/40 text-sm font-medium hover:bg-muted transition-all">
                                            <Receipt className="w-4 h-4" /> Export Receipt PDF
                                          </button>
                                        </div>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </motion.div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </DashboardLayout>
  );
}
