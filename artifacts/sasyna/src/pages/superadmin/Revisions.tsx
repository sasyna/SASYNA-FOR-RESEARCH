import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { supabase } from "@/lib/supabase";
import { Loader2, MessageSquare, Clock, CheckCircle, ChevronDown, ChevronUp, User, ExternalLink, Download, Sparkles, TrendingUp } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { motion } from "framer-motion";

type Revision = {
  id: string; orderId: string; orderDisplayId: string; studentId: string;
  assignedAdminId?: string; assignedAdminName?: string; description: string;
  status: string; adminResponse?: string; completedFileUrl?: string;
  completedFileLink?: string; createdAt: string; updatedAt: string;
};

type AdminRevisionGroup = {
  adminId: string; adminName: string; pending: number; resolved: number;
  total: number; revisions: Revision[];
};

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const scaleIn = {
  hidden: { opacity: 0, scale: 0.88 },
  show: (i: number) => ({ opacity: 1, scale: 1, transition: { duration: 0.45, delay: i * 0.1, ease: EASE } }),
};
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.08, ease: EASE } }),
};

function statusColor(status: string) {
  if (status === "pending") return "bg-amber-500/15 text-amber-400";
  if (status === "resolved") return "bg-emerald-500/15 text-emerald-400";
  return "bg-blue-500/15 text-blue-400";
}

function Orbs() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
      <div className="absolute -top-32 -right-32 w-[460px] h-[460px] rounded-full bg-cyan-600/8 blur-[100px] animate-pulse" style={{ animationDuration: "7s" }} />
      <div className="absolute bottom-0 -left-20 w-[380px] h-[380px] rounded-full bg-blue-500/7 blur-[110px] animate-pulse" style={{ animationDuration: "9s", animationDelay: "2s" }} />
      <div className="absolute inset-0 opacity-[0.02]"
        style={{ backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
    </div>
  );
}

export default function SuperAdminRevisions() {
  const [data, setData] = useState<{ total: number; byAdmin: AdminRevisionGroup[]; unassigned: Revision[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
      const res = await fetch("/api/superadmin/revisions", { headers });
      if (!res.ok) throw new Error("Failed to load");
      setData(await res.json());
    } catch { setData(null); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggleAdmin = (id: string) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  const totalPending = data?.byAdmin.reduce((s, a) => s + a.pending, 0) || 0;
  const totalResolved = data?.byAdmin.reduce((s, a) => s + a.resolved, 0) || 0;

  const statCards = [
    { label: "Total", value: data?.total || 0, icon: MessageSquare, gradient: "from-blue-500/20 via-sky-500/10 to-transparent", glow: "shadow-blue-500/20", ring: "ring-blue-500/30", iconBg: "bg-blue-500/15", iconColor: "text-blue-400" },
    { label: "Pending", value: totalPending, icon: Clock, gradient: "from-amber-500/20 via-orange-500/10 to-transparent", glow: "shadow-amber-500/20", ring: "ring-amber-500/30", iconBg: "bg-amber-500/15", iconColor: "text-amber-400" },
    { label: "Resolved", value: totalResolved, icon: CheckCircle, gradient: "from-emerald-500/20 via-teal-500/10 to-transparent", glow: "shadow-emerald-500/20", ring: "ring-emerald-500/30", iconBg: "bg-emerald-500/15", iconColor: "text-emerald-400" },
  ];

  if (loading) return (
    <DashboardLayout>
      <Orbs />
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-4 border-cyan-500/20" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-cyan-500 animate-spin" />
        </div>
        <p className="text-muted-foreground text-sm">Loading revisions…</p>
      </div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <Orbs />

      <motion.div variants={fadeUp} custom={0} initial="hidden" animate="show"
        className="mb-8 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-cyan-400">Quality</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">Revisions Overview</h1>
          <p className="mt-1.5 text-muted-foreground">All revision requests across all researchers.</p>
        </div>
        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={load}
          className="px-4 py-2.5 border border-border bg-card/60 backdrop-blur-sm rounded-xl text-sm text-muted-foreground hover:bg-muted/60 transition-all shadow-sm">
          Refresh
        </motion.button>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {statCards.map((stat, i) => (
          <motion.div key={stat.label} variants={scaleIn} custom={i} initial="hidden" animate="show" whileHover={{ y: -4, scale: 1.02 }}
            className={`relative overflow-hidden rounded-2xl border bg-card/60 backdrop-blur-sm p-5 shadow-lg ring-1 ${stat.glow} ${stat.ring}`}>
            <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} pointer-events-none`} />
            <div className="relative flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${stat.iconBg}`}>
                <stat.icon className={`w-6 h-6 ${stat.iconColor}`} />
              </div>
              <div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-0.5">
                  <TrendingUp className="w-2.5 h-2.5" /> Live
                </div>
                <div className="text-3xl font-extrabold text-foreground">{stat.value}</div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-0.5">{stat.label}</div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* By Admin */}
      <motion.div variants={fadeUp} custom={2} initial="hidden" animate="show" className="space-y-4">
        {(!data?.byAdmin || data.byAdmin.length === 0) && (!data?.unassigned || data.unassigned.length === 0) ? (
          <div className="bg-card/60 backdrop-blur-sm border border-border rounded-2xl shadow-lg p-12 text-center">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <div className="text-lg font-semibold mb-1 text-foreground">No revision requests yet</div>
          </div>
        ) : (
          <>
            {data?.byAdmin.map(group => (
              <div key={group.adminId} className="bg-card/60 backdrop-blur-sm border border-border rounded-2xl shadow-lg ring-1 ring-border/50 overflow-hidden">
                <button onClick={() => toggleAdmin(group.adminId)}
                  className="w-full flex items-center justify-between p-5 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold">
                      <User className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-foreground">{group.adminName}</div>
                      <div className="text-xs text-muted-foreground">{group.total} total · {group.pending} pending · {group.resolved} resolved</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {group.pending > 0 && (
                      <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 text-xs font-semibold">{group.pending} pending</span>
                    )}
                    {expanded[group.adminId] ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>
                {expanded[group.adminId] && (
                  <div className="border-t border-border/60 divide-y divide-border/60">
                    {group.revisions.map(r => (
                      <div key={r.id} className="p-5">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <span className="font-mono text-sm font-bold text-primary">{r.orderDisplayId || r.orderId}</span>
                            <p className="text-sm text-foreground mt-1">{r.description}</p>
                          </div>
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium shrink-0 ${statusColor(r.status)}`}>
                            {r.status === "resolved" ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                            {r.status}
                          </span>
                        </div>
                        {r.adminResponse && (
                          <div className="mt-2 p-3 bg-muted/40 rounded-xl text-sm text-foreground">
                            <strong className="text-xs text-muted-foreground block mb-1">Response:</strong>
                            {r.adminResponse}
                          </div>
                        )}
                        {(r.completedFileUrl || r.completedFileLink) && (
                          <div className="mt-2 p-3 bg-emerald-500/8 border border-emerald-500/20 rounded-xl space-y-1.5">
                            <strong className="text-xs text-emerald-400 block">Resolved Document:</strong>
                            {r.completedFileLink && (
                              <a href={r.completedFileLink} target="_blank" rel="noreferrer"
                                className="flex items-center gap-1.5 text-xs text-emerald-400 hover:underline">
                                <ExternalLink className="w-3 h-3" /> Open Link
                              </a>
                            )}
                            {r.completedFileUrl && r.completedFileUrl !== r.completedFileLink && (
                              <a href={r.completedFileUrl} target="_blank" rel="noreferrer"
                                className="flex items-center gap-1.5 text-xs text-emerald-400 hover:underline">
                                <Download className="w-3 h-3" /> Download File
                              </a>
                            )}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">{formatDate(r.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {data?.unassigned && data.unassigned.length > 0 && (
              <div className="bg-card/60 backdrop-blur-sm border border-border rounded-2xl shadow-lg ring-1 ring-border/50 overflow-hidden">
                <button onClick={() => toggleAdmin("unassigned")}
                  className="w-full flex items-center justify-between p-5 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground"><User className="w-5 h-5" /></div>
                    <div className="text-left">
                      <div className="font-semibold text-foreground">Unassigned</div>
                      <div className="text-xs text-muted-foreground">{data.unassigned.length} revision(s) without a researcher</div>
                    </div>
                  </div>
                  {expanded["unassigned"] ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                {expanded["unassigned"] && (
                  <div className="border-t border-border/60 divide-y divide-border/60">
                    {data.unassigned.map(r => (
                      <div key={r.id} className="p-5">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <span className="font-mono text-sm font-bold text-primary">{r.orderDisplayId || r.orderId}</span>
                            <p className="text-sm text-foreground mt-1">{r.description}</p>
                          </div>
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium shrink-0 ${statusColor(r.status)}`}>{r.status}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">{formatDate(r.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
