import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useGetAdminOrders, useGetAdminStats, useClaimOrder } from "@workspace/api-client-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Loader2, ArrowRight, Briefcase, Wallet, Clock, CheckCircle2,
  Search, X, Eye, AlertCircle, BookOpen, GraduationCap, ShieldAlert,
  Sparkles, TrendingUp, Zap, CreditCard, Download, FileText
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

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
      <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full bg-blue-600/8 blur-[100px] animate-pulse" style={{ animationDuration: "6s" }} />
      <div className="absolute top-1/2 -left-40 w-[420px] h-[420px] rounded-full bg-emerald-500/7 blur-[120px] animate-pulse" style={{ animationDuration: "8s", animationDelay: "2s" }} />
      <div className="absolute bottom-0 right-1/3 w-[360px] h-[360px] rounded-full bg-violet-500/6 blur-[100px] animate-pulse" style={{ animationDuration: "10s", animationDelay: "4s" }} />
      <div className="absolute inset-0 opacity-[0.025]"
        style={{ backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
    </div>
  );
}

function ActiveOrderBlockModal({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, ease: EASE }}
        className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 to-orange-400" />
        <div className="p-8">
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-5">
              <ShieldAlert className="w-10 h-10 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">Cannot Claim Order</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              {message || "You must complete your current active order before claiming a new one."}
            </p>
            <div className="w-full p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl mb-6 text-left">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-2">Why this restriction?</p>
              <ul className="space-y-1.5 text-xs text-amber-700 dark:text-amber-300">
                {[
                  "Each researcher can only focus on one order at a time to ensure quality.",
                  "Complete or resolve any pending revisions on your current order first.",
                  "Once done, new orders will be available for you to claim.",
                ].map((txt, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    {txt}
                  </li>
                ))}
              </ul>
            </div>
            <button onClick={onClose}
              className="w-full py-3 bg-primary text-primary-foreground rounded-2xl font-semibold text-sm hover:bg-primary/90 transition-colors">
              Got it
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

type Order = {
  id: string;
  orderId: string;
  researchTopic: string;
  serviceType?: string;
  createdAt: string;
  status: string;
  department?: string;
  courseName?: string;
  levelOfStudy?: string;
  researchObjectives?: string;
  additionalInstructions?: string;
  studentName?: string;
  studentEmail?: string;
  studentPhoneNumber?: string;
  depositAmount?: number;
  totalAmount?: number;
  depositPaid?: boolean;
  balancePaid?: boolean;
  uploadedFileUrl?: string;
  uploadedFileName?: string;
};

function OrderPreviewModal({ order, onClose, onClaim, claiming }: {
  order: Order; onClose: () => void; onClaim: () => void; claiming: boolean;
}) {
  const { toast } = useToast();
  const [downloadingProposal, setDownloadingProposal] = useState(false);

  const handleDownloadProposal = async () => {
    setDownloadingProposal(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/orders/${order.id}/proposal-download-url`, { headers });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "Download failed", description: err.error || "Could not generate download link.", variant: "destructive" });
        return;
      }
      const { signedUrl, filename } = await res.json();
      const a = document.createElement("a");
      a.href = signedUrl;
      a.download = filename || "proposal.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      toast({ title: "Download failed", description: "An error occurred while downloading the proposal.", variant: "destructive" });
    } finally {
      setDownloadingProposal(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-5 border-b border-border flex items-center justify-between shrink-0 bg-gradient-to-r from-muted/40 to-transparent">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-mono text-sm font-bold text-primary">{order.orderId}</span>
              <StatusBadge status={order.status} />
            </div>
            <p className="text-xs text-muted-foreground">Order Details Preview</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" /> Research Topic
            </div>
            <div className="bg-muted/30 rounded-xl p-3 text-sm font-semibold text-foreground">{order.researchTopic}</div>
          </div>
          {order.researchObjectives && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Research Objectives</div>
              <div className="bg-muted/30 rounded-xl p-3 text-sm text-foreground whitespace-pre-wrap leading-relaxed">{order.researchObjectives}</div>
            </div>
          )}
          {order.additionalInstructions && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Additional Instructions</div>
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-sm text-foreground whitespace-pre-wrap leading-relaxed">{order.additionalInstructions}</div>
            </div>
          )}
          {(order.studentName || order.studentEmail || order.studentPhoneNumber) && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5" /> Student Details
              </div>
              <div className="bg-muted/30 rounded-xl p-3 space-y-1.5">
                {order.studentName && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground w-14 shrink-0 text-xs uppercase">Name</span>
                    <span className="font-semibold text-foreground">{order.studentName}</span>
                  </div>
                )}
                {order.studentEmail && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground w-14 shrink-0 text-xs uppercase">Email</span>
                    <span className="text-foreground">{order.studentEmail}</span>
                  </div>
                )}
                {order.studentPhoneNumber && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground w-14 shrink-0 text-xs uppercase">Phone</span>
                    <span className="text-foreground">{order.studentPhoneNumber}</span>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Service Type", value: order.serviceType },
              { label: "Level of Study", value: order.levelOfStudy },
              { label: "Department", value: order.department },
              { label: "Course", value: order.courseName },
            ].filter(f => f.value).map(({ label, value }) => (
              <div key={label} className="bg-muted/30 rounded-xl p-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                  <GraduationCap className="w-3 h-3" /> {label}
                </div>
                <div className="text-sm font-semibold text-foreground">{value}</div>
              </div>
            ))}
          </div>
          {(order.totalAmount !== undefined || order.depositAmount !== undefined) && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" /> Payment Details
              </div>
              <div className="grid grid-cols-2 gap-3">
                {order.totalAmount !== undefined && (
                  <div className="bg-muted/30 rounded-xl p-3">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Amount</div>
                    <div className="text-sm font-bold text-foreground">{formatCurrency(order.totalAmount)}</div>
                  </div>
                )}
                {order.depositAmount !== undefined && (
                  <div className="bg-muted/30 rounded-xl p-3">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Deposit</div>
                    <div className="text-sm font-bold text-foreground">{formatCurrency(order.depositAmount)}</div>
                  </div>
                )}
                <div className={`rounded-xl p-3 ${order.depositPaid ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-muted/30"}`}>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Deposit Paid</div>
                  <div className={`text-sm font-semibold ${order.depositPaid ? "text-emerald-400" : "text-muted-foreground"}`}>
                    {order.depositPaid ? "✓ Paid" : "Pending"}
                  </div>
                </div>
                <div className={`rounded-xl p-3 ${order.balancePaid ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-muted/30"}`}>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Balance Paid</div>
                  <div className={`text-sm font-semibold ${order.balancePaid ? "text-emerald-400" : "text-muted-foreground"}`}>
                    {order.balancePaid ? "✓ Paid" : "Pending"}
                  </div>
                </div>
              </div>
            </div>
          )}
          {order.uploadedFileUrl && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Approved Proposal
              </div>
              <div className="flex items-center gap-3 p-3.5 bg-sky-500/8 border border-sky-500/25 rounded-xl">
                <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-sky-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-sky-400 truncate">{order.uploadedFileName || "Proposal"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Uploaded by student</p>
                </div>
                <button
                  onClick={handleDownloadProposal}
                  disabled={downloadingProposal}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 text-sm font-semibold hover:bg-sky-500/25 transition-colors disabled:opacity-60 shrink-0"
                >
                  {downloadingProposal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Download
                </button>
              </div>
            </div>
          )}
          <div className="text-xs text-muted-foreground">Submitted: {formatDate(order.createdAt)}</div>
        </div>
        <div className="p-5 border-t border-border flex gap-3 shrink-0">
          <button onClick={onClaim} disabled={claiming}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 disabled:opacity-60 transition-colors shadow-sm shadow-primary/20">
            {claiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Claim This Order
          </button>
          <button onClick={onClose}
            className="flex-1 py-3 border border-border rounded-xl font-medium text-sm text-muted-foreground hover:bg-muted transition-colors">
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const { data: stats } = useGetAdminStats();
  const { data: orders, isLoading } = useGetAdminOrders();
  const queryClient = useQueryClient();
  const { mutate: claimOrder, isPending } = useClaimOrder();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [previewOrder, setPreviewOrder] = useState<Order | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [blockModal, setBlockModal] = useState<{ open: boolean; message: string }>({ open: false, message: "" });

  const firstName = (user?.user_metadata?.full_name || user?.user_metadata?.name || "Researcher").split(" ")[0];

  const handleClaim = (orderId: string, displayId: string) => {
    setClaimingId(displayId);
    claimOrder({ orderId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
        setPreviewOrder(null);
        toast({ title: "Order claimed!", description: `You have successfully claimed order ${displayId}.` });
      },
      onError: (err: Error) => {
        setPreviewOrder(null);
        const raw = err.message || "";
        const clean = raw.replace(/^HTTP \d{3}[^:]*:\s*/i, "").trim();
        setBlockModal({ open: true, message: clean || "You must complete your current active order before claiming a new one." });
      },
      onSettled: () => setClaimingId(null),
    });
  };

  const allAvailable = orders?.filter(o => o.status === "pending_assignment") || [];
  const myOrders = orders?.filter(o => o.status !== "pending_assignment") || [];

  const availableOrders = search.trim()
    ? allAvailable.filter(o =>
        o.orderId?.toLowerCase().includes(search.toLowerCase()) ||
        o.researchTopic?.toLowerCase().includes(search.toLowerCase())
      )
    : allAvailable;

  const filteredMyOrders = workspaceSearch.trim()
    ? myOrders.filter(o =>
        o.orderId?.toLowerCase().includes(workspaceSearch.toLowerCase()) ||
        o.researchTopic?.toLowerCase().includes(workspaceSearch.toLowerCase())
      )
    : myOrders;

  const pendingWallet = Number(stats?.pendingWallet) || 0;
  const walletBalance = Number(stats?.walletBalance) || 0;

  // ✅ ADDED THIS (REAL DATA)
  const awaitingBalanceCount = myOrders.filter(
    o => o.status === "awaiting_balance"
  ).length;

  // totalInProgress = all active (assigned + in_progress + under_review + awaiting_balance)
  // totalAssigned = awaiting balance count
  // totalCompleted = completed + ready_for_download
  const statCards = [
    {
      label: "Active Orders", value: stats?.totalInProgress || 0, icon: Briefcase,
      gradient: "from-blue-500/20 via-sky-500/10 to-transparent", glow: "shadow-blue-500/20", ring: "ring-blue-500/30",
      iconBg: "bg-blue-500/15", iconColor: "text-blue-400", trend: "Active",
    },
    {
      label: "Awaiting Balance", value: awaitingBalanceCount, icon: CreditCard, // ✅ FIXED HERE
      gradient: "from-cyan-500/20 via-teal-500/10 to-transparent", glow: "shadow-cyan-500/20", ring: "ring-cyan-500/30",
      iconBg: "bg-cyan-500/15", iconColor: "text-cyan-400", trend: "Pending Pay",
    },
    {
      label: "Completed", value: stats?.totalCompleted || 0, icon: CheckCircle2,
      gradient: "from-emerald-500/20 via-teal-500/10 to-transparent", glow: "shadow-emerald-500/20", ring: "ring-emerald-500/30",
      iconBg: "bg-emerald-500/15", iconColor: "text-emerald-400", trend: "Done",
    },
    {
      label: "Available Balance", value: null, display: formatCurrency(walletBalance), icon: Wallet,
      gradient: "from-amber-500/20 via-orange-500/10 to-transparent", glow: "shadow-amber-500/20", ring: "ring-amber-500/30",
      iconBg: "bg-amber-500/15", iconColor: "text-amber-400", trend: "Withdraw",
    },
  ] as const;

  return (
    <DashboardLayout>
      {blockModal.open && (
        <ActiveOrderBlockModal message={blockModal.message} onClose={() => setBlockModal({ open: false, message: "" })} />
      )}
      {previewOrder && (
        <OrderPreviewModal
          order={previewOrder as Order}
          onClose={() => setPreviewOrder(null)}
          onClaim={() => handleClaim(previewOrder.orderId || previewOrder.id, previewOrder.orderId)}
          claiming={claimingId === previewOrder.orderId}
        />
      )}

      <Orbs />

      {/* Hero greeting */}
      <motion.div variants={fadeUp} custom={0} initial="hidden" animate="show" className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-blue-400">Researcher Portal</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            Welcome back, {firstName}!
          </h1>
          <p className="mt-1.5 text-muted-foreground">Manage your assigned research projects and track earnings.</p>
        </div>
        <Link href="/admin/earnings">
          <motion.div whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm text-white shadow-lg shadow-blue-500/25 cursor-pointer whitespace-nowrap"
            style={{ background: "linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)" }}>
            <Wallet className="w-4 h-4" /> My Earnings
          </motion.div>
        </Link>
      </motion.div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-8">
        {statCards.map((stat, i) => (
          <motion.div key={stat.label} variants={scaleIn} custom={i} initial="hidden" animate="show" whileHover={{ y: -4, scale: 1.02 }}
            className={`relative overflow-hidden rounded-2xl border bg-card/60 backdrop-blur-sm p-4 sm:p-5 shadow-lg ring-1 ${stat.glow} ${stat.ring} cursor-default`}>
            <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} pointer-events-none`} />
            <div className="relative flex items-start justify-between mb-3">
              <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center ${stat.iconBg}`}>
                <stat.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${stat.iconColor}`} />
              </div>
              <div className="flex items-center gap-1 text-[10px] sm:text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                <TrendingUp className="w-2.5 h-2.5" />{stat.trend}
              </div>
            </div>
            <div className="relative">
              <div className="text-2xl sm:text-3xl font-extrabold text-foreground leading-none mb-1">
                {"display" in stat ? stat.display : stat.value}
              </div>
              <div className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">{stat.label}</div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Pending earnings banner */}
      {pendingWallet > 0 && (
        <motion.div variants={fadeUp} custom={2} initial="hidden" animate="show"
          className="mb-6 flex items-center justify-between gap-4 p-4 rounded-2xl border border-amber-500/30 bg-amber-500/8 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="text-sm font-bold text-foreground">Pending Earnings</div>
              <div className="text-xs text-muted-foreground">Locked until orders are fully completed</div>
            </div>
          </div>
          <div className="text-lg font-extrabold text-amber-400 shrink-0">{formatCurrency(pendingWallet)}</div>
        </motion.div>
      )}

      <div className="space-y-8">
        {/* Available Orders */}
        <motion.div variants={fadeUp} custom={3} initial="hidden" animate="show"
          className="bg-card/60 backdrop-blur-sm rounded-2xl border border-border shadow-lg ring-1 ring-border/50 overflow-hidden">
          <div className="p-6 border-b border-border/60 bg-gradient-to-r from-muted/40 to-transparent">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-lg font-bold text-foreground">Available Orders</h2>
                  <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full font-bold">{allAvailable.length}</span>
                </div>
                <p className="text-sm text-muted-foreground">Preview and claim orders. One active order at a time.</p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search by ID or topic..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
            </div>
          </div>

          <div className="px-6 py-3 bg-blue-500/5 border-b border-blue-500/10 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-300/80">
              You cannot claim a new order while you have an active order in progress or a pending revision.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30">
                  <th className="px-6 py-3.5">Order ID</th>
                  <th className="px-6 py-3.5">Topic</th>
                  <th className="px-6 py-3.5">Service</th>
                  <th className="px-6 py-3.5">Date</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {isLoading ? (
                  <tr><td colSpan={5} className="px-6 py-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td></tr>
                ) : availableOrders.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-muted-foreground text-sm">
                    {search ? "No orders match your search." : "No orders available to claim right now."}
                  </td></tr>
                ) : (
                  availableOrders.map((order, i) => (
                    <motion.tr key={order.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 + i * 0.04 }} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-6 py-4 font-mono text-sm text-foreground">{order.orderId}</td>
                      <td className="px-6 py-4 text-foreground/80 max-w-[250px] truncate text-sm">{order.researchTopic}</td>
                      <td className="px-6 py-4 text-sm text-muted-foreground capitalize">{order.serviceType?.replace(/_/g, " ")}</td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{formatDate(order.createdAt)}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => setPreviewOrder(order as Order)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 border border-border text-foreground rounded-xl text-xs font-medium hover:bg-muted transition-colors">
                            <Eye className="w-3.5 h-3.5" /> Preview
                          </button>
                          <button onClick={() => handleClaim(order.orderId || "", order.orderId || "")}
                            disabled={isPending || claimingId !== null}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:bg-primary/90 disabled:opacity-60 transition-colors shadow-sm shadow-primary/20">
                            {claimingId === order.orderId ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                            Claim
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* My Active Orders */}
        <motion.div variants={fadeUp} custom={4} initial="hidden" animate="show"
          className="bg-card/60 backdrop-blur-sm rounded-2xl border border-border shadow-lg ring-1 ring-border/50 overflow-hidden">
          <div className="p-6 border-b border-border/60 bg-gradient-to-r from-muted/40 to-transparent">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-foreground">My Workspace</h2>
                <p className="text-sm text-muted-foreground mt-1">Orders currently assigned to you.</p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input value={workspaceSearch} onChange={e => setWorkspaceSearch(e.target.value)}
                  placeholder="Search by order ID or topic..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30">
                  <th className="px-6 py-3.5">Order ID</th>
                  <th className="px-6 py-3.5">Topic</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {isLoading ? (
                  <tr><td colSpan={4} className="px-6 py-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td></tr>
                ) : filteredMyOrders.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-12 text-center text-muted-foreground text-sm">
                    {workspaceSearch ? "No orders match your search." : "No active orders in your workspace."}
                  </td></tr>
                ) : (
                  filteredMyOrders.map((order, i) => (
                    <motion.tr key={order.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 + i * 0.04 }} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-6 py-4 font-mono text-sm font-medium text-foreground">{order.orderId}</td>
                      <td className="px-6 py-4 text-foreground/80 max-w-[300px] truncate text-sm">{order.researchTopic}</td>
                      <td className="px-6 py-4"><StatusBadge status={order.status || ""} /></td>
                      <td className="px-6 py-4 text-right">
                        <Link href={`/admin/orders/${order.id}`}
                          className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary/80 transition-colors group-hover:gap-2">
                          Manage <ArrowRight className="w-4 h-4 transition-all" />
                        </Link>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
