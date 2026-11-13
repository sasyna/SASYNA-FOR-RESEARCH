import { useRoute, Link } from "wouter";
import { useGetOrder, useInitializePayment, useRequestRefund } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { generateReceipt } from "@/lib/generateReceipt";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, Download, CreditCard, AlertTriangle, ArrowLeft,
  Clock, CheckCircle2, ExternalLink, FileText, RefreshCw,
  GraduationCap, Sparkles, Zap, Shield, Info, SearchCheck,
  XCircle, WifiOff, TriangleAlert
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

const PAYMENTS_ENABLED = false;

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

const TIMELINE_STEPS = [
  { id: "pending_payment",     label: "Deposit",       icon: CreditCard    },
  { id: "pending_assignment",  label: "Assigned",      icon: Clock         },
  { id: "in_progress",         label: "In Progress",   icon: RefreshCw     },
  { id: "completed",           label: "Completed",     icon: CheckCircle2  },
  { id: "ready_for_download",  label: "Download",      icon: Download      },
];

function getTimelineIndex(status: string) {
  const direct = TIMELINE_STEPS.findIndex(s => s.id === status);
  if (direct !== -1) return direct;
  if (status === "assigned" || status === "under_review") return 2;
  if (status === "awaiting_balance") return 3;
  if (status === "closed") return 4;
  return 0;
}

function Orbs() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
      <div className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full bg-violet-600/8 blur-[90px] animate-pulse" style={{ animationDuration: "7s" }} />
      <div className="absolute bottom-0 right-0 w-[380px] h-[380px] rounded-full bg-sky-500/8 blur-[100px] animate-pulse" style={{ animationDuration: "9s", animationDelay: "2s" }} />
      <div className="absolute inset-0 opacity-[0.022]"
        style={{ backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
    </div>
  );
}

export default function OrderDetails() {
  const [, params] = useRoute("/student/orders/:id");
  const orderId = params?.id || "";
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [generatingReceipt, setGeneratingReceipt] = useState(false);
  const [recheckState, setRecheckState] = useState<"idle" | "checking" | "found" | "not_found">("idle");
  const [downloadingFile, setDownloadingFile] = useState(false);
  const [showRefundDialog, setShowRefundDialog] = useState(false);

  const { data: order, isLoading } = useGetOrder(orderId, { query: { queryKey: ['/api/orders', orderId], enabled: !!orderId } });
  const { mutate: initPayment, isPending: isPaying } = useInitializePayment();
  const { mutate: requestRefund, isPending: isRefunding } = useRequestRefund();

  // ── Payment recheck ──────────────────────────────────────────────────────────
  // Calls the backend recheck endpoint which looks up all pending Paystack
  // references for this order and re-verifies them server-to-server.
  // This recovers payments where the user closed the browser before the
  // Paystack callback page loaded.
  const handleRecheck = useCallback(async (silent = false) => {
    if (!orderId || recheckState === "checking") return;
    setRecheckState("checking");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;

      const res = await fetch(`/api/payments/recheck/${orderId}`, { method: "POST", headers });
      const data = await res.json() as {
        found: boolean; applied: boolean; paymentType?: string;
        orderStatus?: string; depositPaid?: boolean; balancePaid?: boolean;
      };

      if (data.applied) {
        // Payment was found and recorded — refresh order data
        setRecheckState("found");
        queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId] });
        queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
        toast({
          title: "Payment confirmed!",
          description: data.paymentType === "balance"
            ? "Your balance payment was confirmed. Your order is now ready for download."
            : "Your deposit payment was confirmed. A researcher will be assigned shortly.",
        });
      } else if (data.found && !data.applied) {
        // References existed but were already applied (idempotent — refresh anyway)
        setRecheckState("found");
        queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId] });
      } else {
        setRecheckState("not_found");
      }
    } catch {
      setRecheckState("not_found");
    }
  }, [orderId, recheckState, queryClient, toast]);


  if (isLoading) {
    return (
      <DashboardLayout>
        <Orbs />
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-4 border-violet-500/20" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-violet-500 animate-spin" />
          </div>
          <p className="text-muted-foreground text-sm">Loading order details…</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!order) {
    return (
      <DashboardLayout>
        <div className="p-10 text-center text-muted-foreground">Order not found</div>
      </DashboardLayout>
    );
  }

  const handlePayment = (type: "deposit" | "balance" | "full") => {
    const totalAmt = order.totalAmount || 0;
    const depAmt = order.depositAmount || 0;
    const amount = type === "deposit" ? depAmt
      : type === "full" ? totalAmt
      : totalAmt - depAmt;
    const paymentType = type === "full" ? "deposit" : type;
    initPayment({ data: { orderId: order.orderId || order.id, email: user?.email || "", amount, paymentType } }, {
      onSuccess: (res: { authorizationUrl: string }) => { window.location.href = res.authorizationUrl; },
      onError: () => { toast({ title: "Payment error", description: "Failed to initialize payment. Please try again.", variant: "destructive" }); }
    });
  };

  const handleRefund = () => setShowRefundDialog(true);

  const confirmRefund = () => {
    requestRefund({ orderId: order.id }, {
      onSuccess: () => {
        setShowRefundDialog(false);
        queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId] });
        queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
        toast({ title: "Refund requested", description: "Your refund request has been submitted." });
      },
      onError: (err: unknown) => {
        setShowRefundDialog(false);
        const msg = err instanceof Error ? err.message : "Refund failed";
        toast({ title: "Refund error", description: msg, variant: "destructive" });
      }
    });
  };

  const handleDownloadReceipt = async () => {
    setGeneratingReceipt(true);
    try {
      await generateReceipt(order as Parameters<typeof generateReceipt>[0]);
      toast({ title: "Receipt downloaded", description: "Your payment receipt has been saved as a PDF." });
    } catch {
      toast({ title: "Receipt error", description: "Failed to generate receipt. Please try again.", variant: "destructive" });
    } finally {
      setGeneratingReceipt(false);
    }
  };

  const handleDownloadFile = async () => {
    setDownloadingFile(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
      const res = await fetch(`/api/orders/${orderId}/completed-download-url`, { headers });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "Download failed", description: err.error || "Could not download file.", variant: "destructive" });
        return;
      }
      const { signedUrl } = await res.json();
      const a = document.createElement("a");
      a.href = signedUrl;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      toast({ title: "Download failed", description: "An error occurred.", variant: "destructive" });
    } finally {
      setDownloadingFile(false);
    }
  };

  const totalAmt = order.totalAmount || 0;
  const depAmt = order.depositAmount || 0;
  const balanceAmt = totalAmt - depAmt;

  // Payment visibility — allow at any point in the order lifecycle
  const showDepositOrFull = PAYMENTS_ENABLED && !order.depositPaid && !order.balancePaid;
  const showBalancePayment = PAYMENTS_ENABLED && order.depositPaid && !order.balancePaid;
  const hasAnyPayment = order.depositPaid || order.balancePaid;

  const currentStepIndex = getTimelineIndex(order.status || "");
  // When paying "full", the backend sets balance_paid=true, so balancePaid alone covers all cases
  const fullyPaid = order.balancePaid;
  const downloadUrl = order.completedFileUrl || order.completedFileLink;
  // Only show download button when file exists AND student has fully paid
  const showDownload = fullyPaid && order.status === "ready_for_download" && !!downloadUrl;
  const canRefund = order.status === "pending_assignment" && !order.assignedAdminId;
  const canRequestRevision = order.status === "ready_for_download" || order.status === "closed";
  const researcherFirstName = order.assignedAdminName ? order.assignedAdminName.split(" ")[0] : null;

  return (
    <DashboardLayout>
      <Orbs />

      {/* ── back + header ── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="mb-6">
        <Link href="/student/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" /> Back to Dashboard
        </Link>

        {/* hero card */}
        <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/70 backdrop-blur-sm shadow-xl ring-1 ring-border/50 p-5 sm:p-6">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500/8 via-transparent to-sky-500/5 pointer-events-none" />
          <div className="relative flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-violet-400">Research Order</span>
              </div>
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <h1 className="text-2xl font-extrabold text-foreground font-mono">{order.orderId}</h1>
                <StatusBadge status={order.status || ""} />
              </div>
              <p className="text-sm text-muted-foreground">Placed on {formatDate(order.createdAt)}</p>
            </div>

            {/* action buttons */}
            <div className="flex flex-col gap-3 shrink-0">
              {/* Payment actions group */}
              {showDepositOrFull && (
                <div className="flex flex-wrap gap-2">
                  <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
                    onClick={() => handlePayment("deposit")} disabled={isPaying}
                    className="px-4 py-2.5 rounded-xl font-bold text-white text-sm shadow-lg shadow-violet-500/25 flex items-center gap-2 disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)" }}>
                    {isPaying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                    Pay Deposit · {formatCurrency(depAmt)}
                  </motion.button>
                  <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
                    onClick={() => handlePayment("full")} disabled={isPaying}
                    className="px-4 py-2.5 rounded-xl font-bold text-white text-sm shadow-lg shadow-emerald-500/25 flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 transition-colors">
                    {isPaying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    Pay Full · {formatCurrency(totalAmt)}
                  </motion.button>
                </div>
              )}
              {showBalancePayment && (
                <div className="flex flex-wrap gap-2">
                  <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
                    onClick={() => handlePayment("balance")} disabled={isPaying}
                    className="px-4 py-2.5 rounded-xl font-bold text-white text-sm shadow-lg shadow-violet-500/25 flex items-center gap-2 disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)" }}>
                    {isPaying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    Pay Balance · {formatCurrency(balanceAmt)}
                  </motion.button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {/* "Check payment status" — shown while waiting for deposit/M-PESA prompt */}
                {showDepositOrFull && (
                  <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
                    onClick={() => handleRecheck(false)}
                    disabled={recheckState === "checking"}
                    className="px-4 py-2.5 rounded-xl font-bold text-sm border border-sky-500/40 text-sky-400 hover:bg-sky-500/10 flex items-center gap-2 disabled:opacity-60 transition-all">
                    {recheckState === "checking"
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <SearchCheck className="w-4 h-4" />}
                    {recheckState === "checking" ? "Checking…" : "I Already Paid"}
                  </motion.button>
                )}
                {/* Receipt button — shows if any payment made */}
                {hasAnyPayment && (
                  <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
                    onClick={handleDownloadReceipt} disabled={generatingReceipt}
                    className="px-4 py-2.5 rounded-xl font-bold text-sm border border-violet-500/40 text-violet-400 hover:bg-violet-500/10 flex items-center gap-2 disabled:opacity-60 transition-all">
                    {generatingReceipt ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Download Receipt
                  </motion.button>
                )}
                {showDownload && (
                  <motion.a whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
                    href={downloadUrl} target="_blank" rel="noreferrer"
                    className="px-4 py-2.5 rounded-xl font-bold text-white text-sm shadow-lg shadow-emerald-500/25 flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 transition-colors">
                    <Download className="w-4 h-4" /> View Document
                  </motion.a>
                )}
                {canRequestRevision && (
                  <Link href="/student/revisions">
                    <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
                      className="px-4 py-2.5 rounded-xl font-bold text-sm border border-violet-500/40 text-violet-400 hover:bg-violet-500/10 flex items-center gap-2 cursor-pointer transition-all">
                      <RefreshCw className="w-4 h-4" /> Request Revision
                    </motion.div>
                  </Link>
                )}
                {canRefund && (
                  <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
                    onClick={handleRefund} disabled={isRefunding}
                    className="px-4 py-2.5 rounded-xl font-bold text-sm border border-destructive/40 text-destructive hover:bg-destructive/10 transition-all disabled:opacity-60">
                    Request Refund
                  </motion.button>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Payment recheck status banners ── */}
      {recheckState === "checking" && showDepositOrFull && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-4 rounded-2xl border mb-5 text-sm font-medium bg-sky-500/10 border-sky-500/30 text-sky-300">
          <Loader2 className="w-5 h-5 shrink-0 animate-spin" />
          <p>Checking with Paystack for any completed payment on this order…</p>
        </motion.div>
      )}
      {recheckState === "not_found" && showDepositOrFull && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="relative overflow-hidden rounded-3xl border border-amber-500/30 bg-amber-500/5 backdrop-blur-sm shadow-xl mb-5"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-orange-500/5 pointer-events-none" />
          <div className="relative p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <div className="shrink-0 w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                <XCircle className="w-6 h-6 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-amber-300 mb-1">No Payment Found</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  We checked with Paystack but couldn't find a completed payment linked to this order. This can happen if your payment is still processing.
                </p>
                <div className="space-y-2 mb-5">
                  {[
                    { icon: Clock, text: "M-PESA payments can take 1–2 minutes to confirm — please wait and try again." },
                    { icon: WifiOff, text: "If you closed the browser before the payment page loaded, tap \"I Already Paid\" again." },
                    { icon: CreditCard, text: "If your card or M-PESA was charged but not confirmed after 5 minutes, contact support." },
                  ].map(({ icon: Icon, text }, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                      <Icon className="w-4 h-4 mt-0.5 shrink-0 text-amber-400/70" />
                      <span>{text}</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <motion.button
                    whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
                    onClick={() => handleRecheck(false)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 transition-colors"
                  >
                    <SearchCheck className="w-4 h-4" />
                    Try Again
                  </motion.button>
                  <a
                    href="mailto:support@sasyna.com"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm border border-border text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
                  >
                    Contact Support
                  </a>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Deposit balance notice (shown when deposit paid, balance not) ── */}
      {showBalancePayment && !["awaiting_balance", "ready_for_download"].includes(order.status || "") && (
        <AlertBanner color="amber" icon={Info}>
          You paid the deposit. You can pay the remaining balance of <strong>{formatCurrency(balanceAmt)}</strong> at any time — even before work is completed. Your download will be unlocked as soon as payment is confirmed.
        </AlertBanner>
      )}

      {/* ── status alert banner ── */}
      {!PAYMENTS_ENABLED && (
        <AlertBanner color="emerald" icon={CheckCircle2}>
          Checkout is paused while Sasyna prepares its research workspace. New proposal drafting is free in Research Studio; existing payment records remain unchanged.
        </AlertBanner>
      )}
      {order.status === "assigned" || order.status === "in_progress" ? (
        <AlertBanner color="amber" icon={Clock}>
          A researcher is working on your order. <strong>48-hour delivery guarantee is active.</strong>
        </AlertBanner>
      ) : PAYMENTS_ENABLED && ((order.status === "completed" && !order.balancePaid) || order.status === "awaiting_balance") ? (
        <AlertBanner color="blue" icon={CreditCard}>
          Your research is complete! Pay the remaining balance to unlock your download.
        </AlertBanner>
      ) : order.status === "ready_for_download" && fullyPaid ? (
        <AlertBanner color="emerald" icon={CheckCircle2}>
          Your research is ready! Download your files below. You may also request a revision if needed.
        </AlertBanner>
      ) : order.status === "refund_requested" || order.status === "refunded" ? (
        <AlertBanner color="orange" icon={Clock}>
          {order.status === "refund_requested" ? "Your refund request is under review. We will process it shortly." : "Your refund has been processed."}
        </AlertBanner>
      ) : null}

      {/* ── progress timeline ── */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15, ease: EASE }}
        className="bg-card/70 backdrop-blur-sm border border-border rounded-3xl shadow-sm ring-1 ring-border/50 p-5 sm:p-6 mb-6 overflow-x-auto">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-4">Order Progress</p>
        <div className="min-w-[380px] relative flex justify-between items-start">
          <div className="absolute left-5 right-5 top-5 h-0.5 bg-border -z-10 rounded-full">
            <div className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${(currentStepIndex / (TIMELINE_STEPS.length - 1)) * 100}%`,
                background: "linear-gradient(90deg, #7c3aed, #4f46e5)"
              }} />
          </div>
          {TIMELINE_STEPS.map((step, idx) => {
            const done = idx < currentStepIndex;
            const active = idx === currentStepIndex;
            const StepIcon = step.icon;
            return (
              <div key={step.id} className="flex flex-col items-center gap-2">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border-2 transition-all duration-500 ${
                  done ? "border-violet-600 bg-violet-600 text-white shadow-md shadow-violet-500/30" :
                  active ? "border-violet-500 bg-violet-500/15 text-violet-400 shadow-md shadow-violet-500/20 ring-4 ring-violet-500/10" :
                  "border-border bg-card text-muted-foreground"
                }`}>
                  {done ? <CheckCircle2 className="w-5 h-5" /> : <StepIcon className="w-4 h-4" />}
                </div>
                <span className={`text-[11px] font-semibold text-center leading-tight max-w-[60px] ${
                  done || active ? "text-foreground" : "text-muted-foreground"
                }`}>{step.label}</span>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* ── main content grid ── */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2, ease: EASE }}
        className="grid md:grid-cols-3 gap-5">

        {/* left: research details */}
        <div className="md:col-span-2 space-y-5">
          <DetailCard icon={FileText} title="Research Details">
            <div className="space-y-4">
              <DetailField label="Topic" value={order.researchTopic} large />
              {order.researchObjectives && <DetailField label="Objectives" value={order.researchObjectives} block />}
              {order.additionalInstructions && <DetailField label="Additional Instructions" value={order.additionalInstructions} block />}
            </div>
          </DetailCard>

          {/* completed work */}
          {(() => {
            const orderAny = order as unknown as Record<string, unknown>;
            const storagePath = orderAny.completedFileStoragePath as string | undefined;
            const hasWork = storagePath || order.completedFileUrl || order.completedFileLink;
            if (!hasWork) return null;
            return (
              <DetailCard icon={CheckCircle2} title="Completed Work" accent="emerald">
                {!fullyPaid ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Shield className="w-4 h-4 shrink-0" /> Complete your balance payment to unlock access to your files.
                  </div>
                ) : order.status !== "ready_for_download" ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Shield className="w-4 h-4 shrink-0" /> Your file will be available here once the researcher submits it.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {storagePath ? (
                      <button onClick={handleDownloadFile} disabled={downloadingFile}
                        className="w-full flex items-center gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 font-semibold text-sm hover:bg-emerald-500/20 transition-colors disabled:opacity-60">
                        {downloadingFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        {downloadingFile ? "Preparing download…" : "Download Your Research File"}
                      </button>
                    ) : (
                      <>
                        {order.completedFileLink && (
                          <a href={order.completedFileLink} target="_blank" rel="noreferrer"
                            className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 font-medium text-sm hover:bg-emerald-500/20 transition-colors">
                            <ExternalLink className="w-4 h-4" /> View Document
                          </a>
                        )}
                        {order.completedFileUrl && order.completedFileUrl !== order.completedFileLink && (
                          <a href={order.completedFileUrl} target="_blank" rel="noreferrer"
                            className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 font-medium text-sm hover:bg-emerald-500/20 transition-colors">
                            <Download className="w-4 h-4" /> View Document
                          </a>
                        )}
                      </>
                    )}
                  </div>
                )}
              </DetailCard>
            );
          })()}
        </div>

        {/* right: sidebar */}
        <div className="space-y-4">
          {/* academic info */}
          <DetailCard icon={GraduationCap} title="Academic Info" compact>
            {[
              { label: "Department", value: order.department },
              { label: "Course", value: order.courseName },
              { label: "Level", value: order.levelOfStudy },
              { label: "Service", value: order.serviceType },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between border-b border-border/40 pb-2.5 last:border-0 last:pb-0 gap-2">
                <span className="text-xs text-muted-foreground shrink-0">{label}</span>
                <span className="text-xs font-semibold text-foreground text-right">{value}</span>
              </div>
            ))}
          </DetailCard>

          {/* payment summary */}
          <DetailCard icon={CreditCard} title="Payment" compact>
            <div className="space-y-2.5">
              <PayRow label="Total" value={formatCurrency(order.totalAmount || 0)} />
              <PayRow label="Deposit" value={formatCurrency(order.depositAmount || 0)}
                paid={order.depositPaid} className="border-b border-border/40 pb-2.5" />
              <PayRow label="Balance"
                value={formatCurrency(balanceAmt)}
                paid={order.balancePaid} highlight={!order.balancePaid && !!order.depositPaid} />
            </div>
            {/* Pay balance inline shortcut */}
            {showBalancePayment && (
              <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }}
                onClick={() => handlePayment("balance")} disabled={isPaying}
                className="w-full mt-3 py-2.5 rounded-xl font-bold text-white text-xs shadow-md shadow-violet-500/20 flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)" }}>
                {isPaying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                Pay Balance {formatCurrency(balanceAmt)}
              </motion.button>
            )}
            {/* Receipt download shortcut */}
            {hasAnyPayment && (
              <button onClick={handleDownloadReceipt} disabled={generatingReceipt}
                className="w-full mt-2 py-2 rounded-xl text-xs font-semibold text-violet-400 border border-violet-500/25 hover:bg-violet-500/8 flex items-center justify-center gap-1.5 disabled:opacity-60 transition-colors">
                {generatingReceipt ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                Download Receipt (PDF)
              </button>
            )}
          </DetailCard>

          {/* assigned researcher */}
          {researcherFirstName && (
            <DetailCard icon={Sparkles} title="Researcher" compact>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-violet-500/15 text-violet-400 flex items-center justify-center font-extrabold text-base">
                  {researcherFirstName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-semibold text-foreground text-sm">{researcherFirstName}</div>
                  <div className="text-xs text-muted-foreground">Assigned Researcher</div>
                </div>
              </div>
            </DetailCard>
          )}

          {/* deposit/balance notice */}
          {order.status === "pending_payment" && (
            <div className="bg-amber-500/8 border border-amber-500/25 p-4 rounded-2xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <span className="text-xs text-amber-300 leading-relaxed">
                <strong className="text-amber-400 block mb-0.5">Note on Deposit Payment</strong>
                If you choose to pay the deposit now, you will be required to pay the remaining balance once your research is completed. Your work will be released only after full payment is confirmed.
              </span>
            </div>
          )}

          {/* refund notice */}
          {order.status === "pending_payment" && (
            <div className="bg-muted/20 border border-border/50 p-4 rounded-2xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <span className="text-xs text-muted-foreground leading-relaxed">
                Once a researcher claims your order, refunds are no longer available.
              </span>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Refund confirmation dialog ── */}
      <AnimatePresence>
        {showRefundDialog && (
          <>
            {/* backdrop */}
            <motion.div
              key="refund-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
              onClick={() => !isRefunding && setShowRefundDialog(false)}
            />

            {/* dialog */}
            <motion.div
              key="refund-dialog"
              initial={{ opacity: 0, scale: 0.93, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.93, y: 16 }}
              transition={{ duration: 0.28, ease: EASE }}
              className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md px-4"
            >
              <div className="relative overflow-hidden rounded-3xl border border-destructive/30 bg-card/95 backdrop-blur-xl shadow-2xl ring-1 ring-destructive/20">
                {/* subtle red gradient wash */}
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/8 via-transparent to-orange-500/5 pointer-events-none" />

                <div className="relative p-7">
                  {/* icon */}
                  <div className="flex justify-center mb-5">
                    <div className="w-16 h-16 rounded-2xl bg-destructive/15 border border-destructive/30 flex items-center justify-center shadow-lg shadow-destructive/10">
                      <TriangleAlert className="w-8 h-8 text-destructive" />
                    </div>
                  </div>

                  {/* heading */}
                  <h2 className="text-xl font-extrabold text-foreground text-center mb-2">
                    Request a Refund?
                  </h2>
                  <p className="text-sm text-muted-foreground text-center leading-relaxed mb-6">
                    This will cancel your order and submit a refund request. A member of our team will review it shortly.
                    <span className="block mt-2 text-destructive/80 font-medium">This action cannot be undone.</span>
                  </p>

                  {/* bullet points */}
                  <div className="space-y-2.5 mb-7 bg-muted/20 rounded-2xl p-4 border border-border/50">
                    {[
                      "Your order will be marked as cancelled.",
                      "Refunds are reviewed within 1–3 business days.",
                      "Once a researcher is assigned, refunds are no longer available.",
                    ].map((point, i) => (
                      <div key={i} className="flex items-start gap-2.5 text-xs text-muted-foreground">
                        <div className="w-1.5 h-1.5 rounded-full bg-destructive/60 mt-1.5 shrink-0" />
                        <span>{point}</span>
                      </div>
                    ))}
                  </div>

                  {/* actions */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => setShowRefundDialog(false)}
                      disabled={isRefunding}
                      className="flex-1 py-3 rounded-xl font-bold text-sm border border-border text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors disabled:opacity-50"
                    >
                      Keep My Order
                    </button>
                    <motion.button
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={confirmRefund}
                      disabled={isRefunding}
                      className="flex-1 py-3 rounded-xl font-bold text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90 flex items-center justify-center gap-2 shadow-lg shadow-destructive/25 disabled:opacity-60 transition-colors"
                    >
                      {isRefunding
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                        : "Yes, Request Refund"
                      }
                    </motion.button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

type AlertColor = "amber" | "blue" | "emerald" | "orange";
const ALERT_STYLES: Record<AlertColor, string> = {
  amber:   "bg-amber-500/10 border-amber-500/30 text-amber-300",
  blue:    "bg-sky-500/10 border-sky-500/30 text-sky-300",
  emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
  orange:  "bg-orange-500/10 border-orange-500/30 text-orange-300",
};

function AlertBanner({ color, icon: Icon, children }: { color: AlertColor; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
      className={`flex items-center gap-3 p-4 rounded-2xl border mb-5 text-sm font-medium ${ALERT_STYLES[color]}`}>
      <Icon className="w-5 h-5 shrink-0" />
      <p>{children}</p>
    </motion.div>
  );
}

function DetailCard({ icon: Icon, title, children, accent, compact }: {
  icon: React.ElementType; title: string; children: React.ReactNode; accent?: string; compact?: boolean;
}) {
  const accentColor = accent === "emerald" ? "text-emerald-400 bg-emerald-500/10" : "text-violet-400 bg-violet-500/10";
  return (
    <div className="bg-card/70 backdrop-blur-sm border border-border rounded-2xl shadow-sm ring-1 ring-border/50 overflow-hidden">
      <div className={`flex items-center gap-2.5 px-5 py-3.5 border-b border-border/50 bg-gradient-to-r from-muted/30 to-transparent`}>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${accentColor}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className={`${compact ? "text-xs" : "text-sm"} font-bold uppercase tracking-wider text-foreground`}>{title}</span>
      </div>
      <div className={compact ? "p-4 space-y-2.5" : "p-5"}>{children}</div>
    </div>
  );
}

function DetailField({ label, value, large, block }: { label: string; value?: string | null; large?: boolean; block?: boolean }) {
  return (
    <div>
      <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{label}</div>
      {block ? (
        <div className="text-sm text-foreground leading-relaxed bg-muted/20 p-3.5 rounded-xl whitespace-pre-wrap">{value}</div>
      ) : (
        <div className={`${large ? "text-base font-semibold" : "text-sm"} text-foreground`}>{value}</div>
      )}
    </div>
  );
}

function PayRow({ label, value, paid, highlight, className }: {
  label: string; value: string; paid?: boolean; highlight?: boolean; className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-2 ${className || ""}`}>
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        {label}
        {paid && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
      </span>
      <span className={`text-xs font-bold ${
        paid ? "text-emerald-400" : highlight ? "text-violet-400" : "text-foreground"
      }`}>{value}</span>
    </div>
  );
}
