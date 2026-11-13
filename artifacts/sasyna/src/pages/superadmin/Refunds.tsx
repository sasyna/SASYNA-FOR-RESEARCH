import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { Loader2, CheckCircle, XCircle, AlertTriangle, RotateCcw, Mail, Phone, FileText, History, Download, Sparkles } from "lucide-react";
import { exportToPdf } from "@/lib/exportPdf";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";

const API_BASE = "/api";
const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.08, ease: EASE } }),
};

type RefundRequest = {
  id: string; orderId: string; studentName: string; studentEmail: string;
  studentPhoneNumber: string; researchTopic: string; levelOfStudy: string;
  serviceType: string; title: string; totalAmount: number; depositAmount: number;
  balancePaid: boolean; amountPaid: number;
  updatedAt: string; createdAt: string;
};
type RefundHistory = {
  id: string; orderDisplayId: string; studentName: string; studentEmail: string;
  amount: number; approvedByName: string; createdAt: string;
};

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

function Orbs() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
      <div className="absolute -top-32 -right-32 w-[460px] h-[460px] rounded-full bg-red-600/7 blur-[100px] animate-pulse" style={{ animationDuration: "7s" }} />
      <div className="absolute bottom-0 -left-20 w-[380px] h-[380px] rounded-full bg-amber-500/6 blur-[110px] animate-pulse" style={{ animationDuration: "9s", animationDelay: "2s" }} />
      <div className="absolute inset-0 opacity-[0.02]"
        style={{ backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
    </div>
  );
}

export default function SuperAdminRefunds() {
  const { toast } = useToast();
  const [refunds, setRefunds] = useState<RefundRequest[] | null>(null);
  const [history, setHistory] = useState<RefundHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "history">("pending");

  const load = async () => {
    setLoading(true);
    try {
      const auth = await getAuthHeaders();
      const [refRes, histRes] = await Promise.all([
        fetch(`${API_BASE}/superadmin/refunds`, { headers: auth }),
        fetch(`${API_BASE}/superadmin/refund-history`, { headers: auth }),
      ]);
      if (refRes.ok) setRefunds(await refRes.json());
      if (histRes.ok) setHistory(await histRes.json());
    } catch {
      toast({ title: "Error", description: "Failed to load refund requests", variant: "destructive" });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (orderId: string) => {
    setProcessing(orderId + "-approve");
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/orders/${orderId}/approve-refund`, { method: "POST", headers: auth });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast({ title: "Refund Approved", description: "The refund has been processed and recorded." });
      setRefunds(prev => prev ? prev.filter(r => r.id !== orderId) : prev);
      load();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally { setProcessing(null); }
  };

  const handleReject = async (orderId: string) => {
    setProcessing(orderId + "-reject");
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/orders/${orderId}/reject-refund`, { method: "POST", headers: auth });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast({ title: "Refund Rejected", description: "The order has been moved back to pending assignment." });
      setRefunds(prev => prev ? prev.filter(r => r.id !== orderId) : prev);
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally { setProcessing(null); }
  };

  return (
    <DashboardLayout>
      <Orbs />

      <motion.div variants={fadeUp} custom={0} initial="hidden" animate="show"
        className="mb-8 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-red-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-red-400">Finance</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">Refund Requests</h1>
          <p className="mt-1.5 text-muted-foreground">Review and process student refund requests.</p>
        </div>
        <div className="flex items-center gap-3">
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => {
              if (tab === "pending") {
                const source = refunds || [];
                if (!source.length) return;
                exportToPdf({
                  title: "Pending Refund Requests",
                  subtitle: `${source.length} record${source.length !== 1 ? "s" : ""} — ${new Date().toLocaleDateString("en-GB")}`,
                  filename: `refunds-pending-${new Date().toISOString().slice(0, 10)}.pdf`,
                  columns: [
                    { header: "Order ID", dataKey: "orderId" }, { header: "Student Name", dataKey: "studentName" },
                    { header: "Student Email", dataKey: "studentEmail" }, { header: "Phone", dataKey: "studentPhoneNumber" },
                    { header: "Service", dataKey: "serviceType" }, { header: "Level", dataKey: "levelOfStudy" },
                    { header: "Topic", dataKey: "researchTopic" }, { header: "Order Total", dataKey: "totalAmount" },
                    { header: "Amount to Refund", dataKey: "amountPaid" }, { header: "Payment Status", dataKey: "paymentStatus" },
                    { header: "Requested", dataKey: "refundRequestedAt" },
                  ],
                  rows: source.map((r: any) => ({
                    orderId: r.orderId || "—", studentName: r.studentName || "—",
                    studentEmail: r.studentEmail || "—", studentPhoneNumber: r.studentPhoneNumber || "—",
                    serviceType: r.serviceType || "—", levelOfStudy: r.levelOfStudy || "—",
                    researchTopic: r.researchTopic?.length > 50 ? r.researchTopic.slice(0, 47) + "..." : (r.researchTopic || "—"),
                    totalAmount: formatCurrency(r.totalAmount || 0),
                    amountPaid: formatCurrency(r.amountPaid || 0),
                    paymentStatus: r.balancePaid ? "Fully paid" : "Deposit only",
                    refundRequestedAt: r.updatedAt ? formatDateTime(r.updatedAt) : "—",
                  })),
                });
              } else {
                const source = history || [];
                if (!source.length) return;
                exportToPdf({
                  title: "Refund History",
                  subtitle: `${source.length} record${source.length !== 1 ? "s" : ""} — ${new Date().toLocaleDateString("en-GB")}`,
                  filename: `refunds-history-${new Date().toISOString().slice(0, 10)}.pdf`,
                  columns: [
                    { header: "Order ID", dataKey: "orderDisplayId" }, { header: "Student Name", dataKey: "studentName" },
                    { header: "Student Email", dataKey: "studentEmail" }, { header: "Amount Refunded", dataKey: "amount" },
                    { header: "Approved By", dataKey: "approvedByName" }, { header: "Date & Time", dataKey: "createdAt" },
                  ],
                  rows: source.map((h: any) => ({
                    orderDisplayId: h.orderDisplayId || "—", studentName: h.studentName || "—",
                    studentEmail: h.studentEmail || "—", amount: formatCurrency(h.amount || 0),
                    approvedByName: h.approvedByName || "Super Admin", createdAt: formatDateTime(h.createdAt),
                  })),
                });
              }
            }}
            disabled={loading || (tab === "pending" ? !refunds?.length : !history?.length)}
            className="flex items-center gap-2 px-4 py-2.5 border border-border bg-card/60 backdrop-blur-sm text-foreground rounded-xl text-sm font-medium hover:bg-muted/60 transition-all disabled:opacity-50 shadow-sm">
            <Download className="w-4 h-4" /> Export PDF
          </motion.button>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={load} disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-muted/60 backdrop-blur-sm rounded-xl text-sm font-medium hover:bg-muted transition-colors shadow-sm">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Refresh
          </motion.button>
        </div>
      </motion.div>

      {/* Tabs */}
      <motion.div variants={fadeUp} custom={1} initial="hidden" animate="show" className="flex gap-2 mb-6">
        {(["pending", "history"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab === t ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "bg-card/60 backdrop-blur-sm border border-border text-muted-foreground hover:bg-muted/60"}`}>
            {t === "pending" ? (
              <span className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />Pending ({refunds?.length || 0})</span>
            ) : (
              <span className="flex items-center gap-1.5"><History className="w-3.5 h-3.5" />Refund History</span>
            )}
          </button>
        ))}
      </motion.div>

      <motion.div variants={fadeUp} custom={2} initial="hidden" animate="show">
        {tab === "pending" && (
          <div className="bg-card/60 backdrop-blur-sm border border-border rounded-2xl shadow-lg ring-1 ring-border/50">
            {loading ? (
              <div className="p-16 flex flex-col items-center justify-center gap-4">
                <div className="relative w-10 h-10"><div className="absolute inset-0 rounded-full border-4 border-red-500/20" /><div className="absolute inset-0 rounded-full border-4 border-transparent border-t-red-500 animate-spin" /></div>
                <p className="text-muted-foreground text-sm">Loading refund requests…</p>
              </div>
            ) : !refunds || refunds.length === 0 ? (
              <div className="p-16 text-center">
                <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
                <div className="text-foreground font-semibold text-lg">No Pending Refunds</div>
                <div className="text-muted-foreground text-sm mt-1">All refund requests have been resolved.</div>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {refunds.map(r => (
                  <div key={r.id} className="p-6 hover:bg-muted/20 transition-colors">
                    <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-mono bg-muted/60 px-2 py-1 rounded-lg text-muted-foreground">{r.orderId}</span>
                          <span className="text-xs bg-amber-500/15 text-amber-400 px-2 py-1 rounded-lg font-medium">{r.levelOfStudy} — {r.serviceType}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-sm font-semibold text-foreground">{r.researchTopic || r.title || "Untitled"}</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm">
                          <div className="flex items-center gap-2 text-foreground font-medium">
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                              {(r.studentName || "?").charAt(0).toUpperCase()}
                            </div>
                            {r.studentName || "Unknown"}
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground"><Mail className="w-3.5 h-3.5 text-primary" />{r.studentEmail || "—"}</div>
                          {r.studentPhoneNumber && (
                            <div className="flex items-center gap-1.5 text-muted-foreground"><Phone className="w-3.5 h-3.5 text-primary" />{r.studentPhoneNumber}</div>
                          )}
                          <div className="text-muted-foreground text-xs">Requested: {formatDate(r.updatedAt)}</div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 items-end shrink-0">
                        <div className="text-right">
                          <div className={`text-xs font-medium px-2 py-0.5 rounded-full mb-1 inline-block ${r.balancePaid ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
                            {r.balancePaid ? "Fully paid" : "Deposit only"}
                          </div>
                          <div className="text-xs text-muted-foreground">Amount to refund</div>
                          <div className="text-lg font-bold text-foreground">{formatCurrency(r.amountPaid || 0)}</div>
                          <div className="text-xs text-muted-foreground">of {formatCurrency(r.totalAmount || 0)} order total</div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleApprove(r.id)} disabled={!!processing}
                            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 shadow-md shadow-emerald-600/20">
                            {processing === r.id + "-approve" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                            Approve
                          </button>
                          <button onClick={() => handleReject(r.id)} disabled={!!processing}
                            className="flex items-center gap-1.5 px-4 py-2 bg-red-500/15 text-red-400 rounded-xl text-xs font-semibold hover:bg-red-500/25 transition-colors disabled:opacity-50">
                            {processing === r.id + "-reject" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "history" && (
          <div className="bg-card/60 backdrop-blur-sm border border-border rounded-2xl shadow-lg ring-1 ring-border/50">
            {history.length === 0 ? (
              <div className="p-16 text-center text-muted-foreground">No refunds have been approved yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-muted/30 text-muted-foreground text-[11px] uppercase tracking-wider">
                      {["Order ID", "Student", "Amount Refunded", "Approved By", "Date"].map(h => (
                        <th key={h} className="px-6 py-4 font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {history.map(h => (
                      <tr key={h.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-6 py-4"><span className="text-xs font-mono bg-muted/60 px-2 py-1 rounded-lg text-muted-foreground">{h.orderDisplayId || "—"}</span></td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-foreground">{h.studentName || "—"}</div>
                          <div className="text-xs text-muted-foreground">{h.studentEmail || ""}</div>
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-emerald-400">{formatCurrency(h.amount || 0)}</td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">{h.approvedByName || "Super Admin"}</td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">{formatDateTime(h.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </motion.div>

      <motion.div variants={fadeUp} custom={3} initial="hidden" animate="show"
        className="mt-6 bg-amber-500/8 border border-amber-500/20 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-amber-400 text-sm">Refund Policy Notes</div>
            <ul className="text-xs text-amber-400/80 mt-1.5 space-y-1 list-disc list-inside">
              <li>Approving a refund marks the order as refunded and records it in the refund history.</li>
              <li>Rejecting a refund moves the order back to pending assignment so it can be reassigned.</li>
              <li>Refunds cover the full amount the student actually paid — deposit only, or deposit + balance if fully paid.</li>
            </ul>
          </div>
        </div>
      </motion.div>
    </DashboardLayout>
  );
}
