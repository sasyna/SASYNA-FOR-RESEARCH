import { useState } from "react";
import { useGetRevisions, useGetOrders } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, Send, MessageSquare, Clock, CheckCircle,
  ExternalLink, AlertCircle, RefreshCw, Sparkles, Download, Info
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

function Orbs() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
      <div className="absolute -top-20 -right-20 w-[400px] h-[400px] rounded-full bg-violet-600/8 blur-[100px] animate-pulse" style={{ animationDuration: "7s" }} />
      <div className="absolute bottom-0 left-1/4 w-[350px] h-[350px] rounded-full bg-teal-500/6 blur-[90px] animate-pulse" style={{ animationDuration: "9s", animationDelay: "3s" }} />
      <div className="absolute inset-0 opacity-[0.025]"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 1px, transparent 0)", backgroundSize: "28px 28px" }} />
    </div>
  );
}

type RevisionStatus = "pending" | "in_progress" | "resolved" | string;

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; ring: string; icon: React.ElementType; bar: string }> = {
  resolved:    { label: "Resolved",    color: "text-emerald-400", bg: "bg-emerald-500/10", ring: "ring-emerald-500/30", icon: CheckCircle, bar: "bg-emerald-500" },
  pending:     { label: "Pending",     color: "text-amber-400",   bg: "bg-amber-500/10",   ring: "ring-amber-500/30",   icon: Clock,       bar: "bg-amber-500"   },
  in_progress: { label: "In Progress", color: "text-sky-400",     bg: "bg-sky-500/10",     ring: "ring-sky-500/30",     icon: RefreshCw,   bar: "bg-sky-500"     },
};

function getStatusCfg(status: RevisionStatus) {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG["pending"];
}

type ExtendedRevision = {
  id: string;
  orderId?: string;
  orderDisplayId?: string;
  description?: string;
  status?: string;
  adminResponse?: string;
  correctedFileUrl?: string;
  correctedFileLink?: string;
  correctedFileStoragePath?: string;
  assignedAdminName?: string;
  createdAt?: string;
};

export default function StudentRevisions() {
  const { toast } = useToast();
  const [form, setForm] = useState({ orderId: "", description: "" });
  const [submitted, setSubmitted] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { data: revisions, isLoading, refetch } = useGetRevisions({}, {});
  const { data: orders, isLoading: ordersLoading } = useGetOrders({}, {});

  const eligibleOrders = (orders || []).filter(o =>
    ["ready_for_download"].includes(o.status || "")
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.orderId) { setError("Please select an order."); return; }
    if (!form.description.trim()) { setError("Please describe the revision needed."); return; }
    setIsPending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
      const res = await fetch("/api/revisions", { method: "POST", headers, body: JSON.stringify({ orderId: form.orderId, description: form.description }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit revision request");
      setSubmitted(true);
      setForm({ orderId: "", description: "" });
      refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit revision request");
    } finally {
      setIsPending(false);
    }
  };

  const handleDownloadCorrected = async (revisionId: string) => {
    setDownloadingId(revisionId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
      const res = await fetch(`/api/revisions/${revisionId}/corrected-download-url`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to get download link");
      window.open(data.url, "_blank");
    } catch (err) {
      toast({ title: "Download failed", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  };

  const extRevisions = (revisions || []) as ExtendedRevision[];

  return (
    <DashboardLayout>
      <Orbs />
      <div className="max-w-2xl mx-auto space-y-8">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <span className="text-xs font-bold uppercase tracking-widest text-violet-400">Free Revisions</span>
          </div>
          <h1 className="text-3xl font-extrabold text-foreground">Revision Requests</h1>
          <p className="text-muted-foreground mt-1">Submit corrections for your completed research at no extra charge.</p>
        </motion.div>

        {/* Submit form */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1, ease: EASE }}
          className="bg-card/70 backdrop-blur-sm border border-border rounded-3xl shadow-xl ring-1 ring-border/50 overflow-hidden">

          <div className="px-6 py-5 border-b border-border/60 flex items-center gap-3 bg-gradient-to-r from-violet-500/5 to-transparent">
            <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center">
              <Send className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <div className="font-bold text-foreground">Submit a Revision</div>
              <div className="text-xs text-muted-foreground">Your assigned researcher will review and correct</div>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <AnimatePresence>
              {submitted && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                  className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  Your revision request has been submitted. The researcher will review it and upload the corrected file.
                </motion.div>
              )}
              {error && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                  className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Select Order <span className="text-destructive">*</span></label>
                {ordersLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm p-3">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading your orders...
                  </div>
                ) : eligibleOrders.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-4 border border-border rounded-xl bg-muted/20">
                    No eligible orders found. Revisions can only be requested for completed (ready for download) orders.
                  </div>
                ) : (
                  <select value={form.orderId} onChange={e => setForm(f => ({ ...f, orderId: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border-2 border-border bg-background text-foreground text-sm focus:outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 transition-all appearance-none">
                    <option value="">— Select an order —</option>
                    {eligibleOrders.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.orderId || o.id?.toString().slice(0, 8)} — {o.researchTopic || o.serviceType} ({o.status?.replace(/_/g, " ")})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Describe the Revision <span className="text-destructive">*</span></label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={4} placeholder="Explain clearly what needs to be corrected or changed..."
                  className="w-full px-4 py-3 rounded-xl border-2 border-border bg-background text-foreground text-sm resize-none focus:outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 transition-all" />
              </div>

              <motion.button type="submit" disabled={isPending || eligibleOrders.length === 0}
                whileHover={{ scale: isPending || eligibleOrders.length === 0 ? 1 : 1.01, y: isPending ? 0 : -1 }}
                whileTap={{ scale: 0.98 }}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white shadow-lg shadow-violet-500/25 disabled:opacity-50 transition-all"
                style={{ background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)" }}>
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Submit Revision Request
              </motion.button>
            </form>
          </div>
        </motion.div>

        {/* Revision history */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2, ease: EASE }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-foreground">Revision History</h2>
            {extRevisions.length > 0 && (
              <span className="text-xs font-medium text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-full">
                {extRevisions.length} request{extRevisions.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="bg-card/60 border border-border rounded-2xl p-5 space-y-3">
                  <div className="flex justify-between"><div className="h-4 w-32 rounded bg-muted animate-pulse" /><div className="h-6 w-20 rounded-full bg-muted animate-pulse" /></div>
                  <div className="h-3.5 w-3/4 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-24 rounded bg-muted animate-pulse" />
                </div>
              ))}
            </div>
          ) : extRevisions.length === 0 ? (
            <div className="text-center py-16 bg-card/60 backdrop-blur-sm border border-border rounded-3xl">
              <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <p className="font-semibold text-foreground mb-1">No revision requests yet</p>
              <p className="text-sm text-muted-foreground">Submit a revision above for your completed orders.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {extRevisions.map((r, i) => {
                const cfg = getStatusCfg(r.status || "pending");
                const StatusIcon = cfg.icon;
                const isInProgress = r.status === "pending" || r.status === "in_progress";
                const isResolved = r.status === "resolved";
                const isDownloading = downloadingId === r.id;

                return (
                  <motion.div key={r.id}
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: i * 0.06, ease: EASE }}
                    className={`bg-card/70 backdrop-blur-sm border border-border rounded-2xl overflow-hidden shadow-sm ring-1 ${cfg.ring} relative`}>

                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${cfg.bar}`} />

                    <div className="pl-5 pr-5 pt-4 pb-5">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-md">
                              {r.orderDisplayId || r.orderId?.toString().slice(0, 8)}
                            </span>
                            {r.assignedAdminName && (
                              <span className="text-xs text-muted-foreground">by {r.assignedAdminName}</span>
                            )}
                          </div>
                          <p className="text-sm text-foreground mt-2 leading-relaxed">{r.description}</p>
                        </div>
                        <div className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${cfg.color} ${cfg.bg} ring-1 ${cfg.ring}`}>
                          <StatusIcon className="w-3 h-3" />
                          {cfg.label}
                        </div>
                      </div>

                      {/* In-progress notice — shown when revision is pending/being worked on */}
                      {isInProgress && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          className="mt-3 p-4 bg-sky-500/8 border border-sky-500/25 rounded-xl flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-sky-500/15 flex items-center justify-center shrink-0 mt-0.5">
                            <RefreshCw className="w-4 h-4 text-sky-400 animate-spin" style={{ animationDuration: "3s" }} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-sky-400 mb-1">Revision in Progress</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              Your researcher has received your request and is working on the corrections.
                              Once they upload the revised file, it will appear here automatically — you do not need to do anything.
                            </p>
                            <div className="mt-2 flex items-center gap-1.5 text-xs text-sky-400/70">
                              <Info className="w-3 h-3 shrink-0" />
                              Typical turnaround: 24–48 hours
                            </div>
                          </div>
                        </motion.div>
                      )}

                      {/* Resolved — researcher's written response */}
                      {isResolved && r.adminResponse && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          className="mt-3 p-3.5 bg-muted/30 rounded-xl border border-border/50">
                          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                            Response{r.assignedAdminName ? ` from ${r.assignedAdminName}` : ""}
                          </p>
                          <p className="text-sm text-foreground leading-relaxed">{r.adminResponse}</p>
                        </motion.div>
                      )}

                      {/* Download / view corrected file */}
                      {isResolved && (r.correctedFileStoragePath || r.correctedFileUrl || r.correctedFileLink) && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3">
                          {r.correctedFileStoragePath ? (
                            <button
                              onClick={() => handleDownloadCorrected(r.id)}
                              disabled={isDownloading}
                              className="w-full flex items-center gap-2.5 px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 font-semibold text-sm hover:bg-emerald-500/20 transition-colors disabled:opacity-60">
                              {isDownloading
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparing download…</>
                                : <><Download className="w-4 h-4" /> Download Corrected File</>
                              }
                            </button>
                          ) : (
                            <div className="space-y-2">
                              {r.correctedFileLink && (
                                <a href={r.correctedFileLink} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 font-medium text-sm hover:bg-emerald-500/20 transition-colors">
                                  <ExternalLink className="w-4 h-4" /> View Corrected File (Drive / Link)
                                </a>
                              )}
                              {r.correctedFileUrl && r.correctedFileUrl !== r.correctedFileLink && (
                                <a href={r.correctedFileUrl} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 font-medium text-sm hover:bg-emerald-500/20 transition-colors">
                                  <Download className="w-4 h-4" /> View Corrected File (Direct URL)
                                </a>
                              )}
                            </div>
                          )}
                        </motion.div>
                      )}

                      <p className="text-xs text-muted-foreground mt-3">
                        Submitted {r.createdAt ? formatDate(r.createdAt as string) : ""}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
