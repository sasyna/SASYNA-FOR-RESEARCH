import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useGetOrders } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDate } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import {
  FileText, CheckCircle, Plus, ArrowRight,
  Layers, Sparkles, TrendingUp
} from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.08, ease: EASE },
  }),
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.88 },
  show: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: { duration: 0.45, delay: i * 0.1, ease: EASE },
  }),
};

type StatCard = {
  label: string;
  value: number;
  icon: React.ElementType;
  gradient: string;
  glow: string;
  ring: string;
  iconBg: string;
  iconColor: string;
  trend?: string;
};

type ResearchProjectSummary = {
  id: string;
  title: string;
  status: "draft" | "queued" | "generating" | "ready" | "failed";
  completedSections: number;
  totalSections: number;
  updatedAt: string;
};

export default function StudentDashboard() {
  const { user } = useAuth();
  const { data: orders, isLoading } = useGetOrders();
  const researchQuery = useQuery<ResearchProjectSummary[]>({
    queryKey: ["research-projects", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session?.access_token) throw new Error("Sign in again to load your research projects.");
      const response = await fetch("/api/research/projects", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Your research projects could not be loaded.");
      }
      return Array.isArray(payload.projects) ? payload.projects : [];
    },
    refetchInterval: (query) =>
      query.state.data?.some((project) => project.status === "queued" || project.status === "generating")
        ? 3000
        : false,
  });

  const firstName = (
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    "Student"
  ).split(" ")[0];

  // ✅ Updated: exclude ready_for_download from active
  const EXCLUDED = ["completed", "closed", "refunded", "refund_requested", "ready_for_download"];
  const activeOrders =
    orders?.filter((o) => !EXCLUDED.includes(o.status)).length ?? 0;

  // ✅ Updated: include ready_for_download in completed
  const completedOrders =
    orders?.filter((o) =>
      o.status === "completed" ||
      o.status === "closed" ||
      o.status === "ready_for_download"
    ).length ?? 0;

  // Total includes ALL orders
  const totalOrders = orders?.length ?? 0;

  const stats: StatCard[] = [
    {
      label: "Active Orders",
      value: activeOrders,
      icon: FileText,
      gradient: "from-violet-500/20 via-purple-500/10 to-transparent",
      glow: "shadow-violet-500/20",
      ring: "ring-violet-500/30",
      iconBg: "bg-violet-500/15",
      iconColor: "text-violet-400",
      trend: "In progress",
    },
    {
      label: "Completed",
      value: completedOrders,
      icon: CheckCircle,
      gradient: "from-emerald-500/20 via-teal-500/10 to-transparent",
      glow: "shadow-emerald-500/20",
      ring: "ring-emerald-500/30",
      iconBg: "bg-emerald-500/15",
      iconColor: "text-emerald-400",
      trend: "Delivered",
    },
    {
      label: "Total Orders",
      value: totalOrders,
      icon: Layers,
      gradient: "from-sky-500/20 via-blue-500/10 to-transparent",
      glow: "shadow-sky-500/20",
      ring: "ring-sky-500/30",
      iconBg: "bg-sky-500/15",
      iconColor: "text-sky-400",
      trend: "All time",
    },
  ];

  return (
    <DashboardLayout>
      {/* ── Ambient background orbs ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-violet-600/8 blur-[100px] animate-pulse" style={{ animationDuration: "6s" }} />
        <div className="absolute top-1/2 -right-40 w-[420px] h-[420px] rounded-full bg-sky-500/8 blur-[120px] animate-pulse" style={{ animationDuration: "8s", animationDelay: "2s" }} />
        <div className="absolute bottom-0 left-1/3 w-[360px] h-[360px] rounded-full bg-emerald-500/6 blur-[100px] animate-pulse" style={{ animationDuration: "10s", animationDelay: "4s" }} />
        {/* subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      {/* ── Hero greeting row ── */}
      <motion.div
        className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8"
        variants={fadeUp}
        custom={0}
        initial="hidden"
        animate="show"
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-violet-400">
              Student Portal
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            <span className="bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">
              Hey, {firstName}!
            </span>{" "}
          </h1>
          <p className="mt-1.5 text-muted-foreground">
            Here's your research overview — let's get things done.
          </p>
        </div>

        <Link href="/student/research">
          <motion.div
            whileHover={{ scale: 1.03, y: -2 }}
            whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold bg-primary text-primary-foreground whitespace-nowrap shadow-lg shadow-primary/25 cursor-pointer relative overflow-hidden"
          >
            {/* shimmer effect */}
            <span
              className="absolute inset-0 -translate-x-full hover:translate-x-full transition-transform duration-700 ease-in-out bg-gradient-to-r from-transparent via-white/20 to-transparent"
              aria-hidden
            />
            <Plus className="w-5 h-5" />
            Start New Proposal
          </motion.div>
        </Link>
      </motion.div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-8">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            variants={scaleIn}
            custom={i}
            initial="hidden"
            animate="show"
            whileHover={{ y: -4, scale: 1.02 }}
            className={`relative overflow-hidden rounded-2xl border bg-card/60 backdrop-blur-sm p-4 sm:p-5 shadow-lg ring-1 ${stat.glow} ${stat.ring} cursor-default`}
          >
            {/* gradient wash */}
            <div
              className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} pointer-events-none`}
            />
            {/* top row */}
            <div className="relative flex items-start justify-between mb-3">
              <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center ${stat.iconBg}`}>
                <stat.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${stat.iconColor}`} />
              </div>
              <div className="flex items-center gap-1 text-[10px] sm:text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                <TrendingUp className="w-2.5 h-2.5" />
                {stat.trend}
              </div>
            </div>
            {/* number */}
            <div className="relative">
              <div className="text-2xl sm:text-3xl font-extrabold text-foreground leading-none mb-1">
                {isLoading ? (
                  <span className="inline-block w-8 h-7 rounded-lg bg-muted animate-pulse" />
                ) : (
                  stat.value
                )}
              </div>
              <div className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {stat.label}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.section
        variants={fadeUp}
        custom={4}
        initial="hidden"
        animate="show"
        className="mb-8 overflow-hidden rounded-2xl border border-border/70 bg-card/70 shadow-lg ring-1 ring-border/40"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Your Research Projects</h2>
              <p className="text-xs text-muted-foreground">Saved to your account, including drafts in progress.</p>
            </div>
          </div>
          <Link href="/student/research" className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80">
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {researchQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1].map((item) => <div key={item} className="h-12 animate-pulse rounded-xl bg-muted/50" />)}
          </div>
        ) : researchQuery.error ? (
          <div role="alert" className="px-5 py-4 text-sm text-destructive">
            {researchQuery.error instanceof Error ? researchQuery.error.message : "Your research projects could not be loaded."}
          </div>
        ) : researchQuery.data?.length ? (
          <div className="divide-y divide-border/50">
            {researchQuery.data.slice(0, 4).map((project) => {
              const percent = project.totalSections > 0
                ? Math.min(100, Math.round(project.completedSections / project.totalSections * 100))
                : 0;
              const statusText = project.status === "generating" || project.status === "queued"
                ? "Drafting"
                : project.status === "ready"
                  ? "Ready to review"
                  : project.status === "failed"
                    ? "Paused"
                    : "Draft";
              return (
                <Link key={project.id} href="/student/research">
                  <div className="group flex items-center gap-4 px-5 py-3.5 transition hover:bg-muted/30 sm:px-6">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground group-hover:text-primary">{project.title}</span>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{statusText}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
                        </div>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{project.completedSections}/{project.totalSections} sections</span>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-sm text-muted-foreground">Your proposals and progress will appear here after you start a research project.</p>
            <Link href="/student/research" className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90">
              <Plus className="h-3.5 w-3.5" /> Start a proposal
            </Link>
          </div>
        )}
      </motion.section>

      {/* ── Recent orders ── */}
      <motion.div
        variants={fadeUp}
        custom={5}
        initial="hidden"
        animate="show"
        className="rounded-2xl border bg-card/60 backdrop-blur-sm shadow-lg ring-1 ring-border/50 overflow-hidden"
      >
        {/* header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-border/60 bg-gradient-to-r from-muted/40 to-transparent">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-500/15 flex items-center justify-center">
              <FileText className="w-4 h-4 text-violet-400" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-foreground">Recent Orders</h2>
          </div>
          {orders && orders.length > 0 && (
            <span className="text-xs font-medium text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-full">
              {orders.length} total
            </span>
          )}
        </div>

        {/* ── Desktop table (hidden on mobile) ── */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30">
                <th className="px-6 py-3.5">Order ID</th>
                <th className="px-6 py-3.5">Topic</th>
                <th className="px-6 py-3.5">Date</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                [...Array(3)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(5)].map((_, j) => (
                      <td key={j} className="px-6 py-4">
                        <div className="h-4 rounded-md bg-muted animate-pulse" style={{ width: j === 1 ? "70%" : "50%" }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : !orders?.length ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <EmptyState />
                  </td>
                </tr>
              ) : (
                orders.map((order, i) => (
                  <motion.tr
                    key={order.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.05 }}
                    className="hover:bg-muted/30 transition-colors group"
                  >
                    <td className="px-6 py-4 font-mono text-xs font-semibold text-foreground whitespace-nowrap">
                      {order.orderId}
                    </td>
                    <td className="px-6 py-4 text-foreground/80 max-w-[260px] truncate text-sm">
                      {order.researchTopic}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground text-sm whitespace-nowrap">
                      {formatDate(order.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link href={`/student/orders/${order.id}`}>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-400 hover:text-violet-300 transition-colors group-hover:gap-2">
                          View <ArrowRight className="w-3.5 h-3.5 transition-all" />
                        </span>
                      </Link>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Mobile card list (hidden on sm+) ── */}
        <div className="sm:hidden divide-y divide-border/50">
          {isLoading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="p-4 space-y-2.5">
                <div className="flex justify-between items-start">
                  <div className="h-3.5 w-24 rounded bg-muted animate-pulse" />
                  <div className="h-5 w-20 rounded-full bg-muted animate-pulse" />
                </div>
                <div className="h-3.5 w-3/4 rounded bg-muted animate-pulse" />
                <div className="h-3 w-20 rounded bg-muted animate-pulse" />
              </div>
            ))
          ) : !orders?.length ? (
            <div className="py-12 px-4 text-center">
              <EmptyState />
            </div>
          ) : (
            orders.map((order, i) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.06 }}
              >
                <Link href={`/student/orders/${order.id}`}>
                  <div className="p-4 hover:bg-muted/30 transition-colors active:bg-muted/50 cursor-pointer">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="font-mono text-[11px] font-bold text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                        {order.orderId}
                      </span>
                      <StatusBadge status={order.status} />
                    </div>
                    <p className="text-sm font-medium text-foreground line-clamp-2 mb-2">
                      {order.researchTopic}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(order.createdAt)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-400">
                        Details <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))
          )}
        </div>
      </motion.div>

      {/* ── Bottom CTA banner ── */}
      {!isLoading && totalOrders === 0 && (
        <motion.div
          variants={fadeUp}
          custom={7}
          initial="hidden"
          animate="show"
          className="mt-6 rounded-2xl overflow-hidden relative"
          style={{
            background: "linear-gradient(135deg, #7c3aed22 0%, #4f46e511 50%, #0ea5e922 100%)",
          }}
        >
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 1px, transparent 0)",
              backgroundSize: "24px 24px",
            }}
          />
          <div className="relative flex flex-col sm:flex-row items-center justify-between gap-4 p-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-violet-400" />
                <span className="text-xs font-bold uppercase tracking-widest text-violet-400">
                  Get started
                </span>
              </div>
              <h3 className="text-xl font-bold text-foreground mb-1">
                Start your first proposal
              </h3>
              <p className="text-sm text-muted-foreground">
                Build your research proposal and save every section to your account.
              </p>
            </div>
            <Link href="/student/research">
              <motion.div
                whileHover={{ scale: 1.04, y: -2 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-white whitespace-nowrap shadow-lg shadow-violet-500/30 cursor-pointer"
                style={{
                  background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
                }}
              >
                <Plus className="w-4 h-4" />
                Start Now
              </motion.div>
            </Link>
          </div>
        </motion.div>
      )}

    </DashboardLayout>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center">
        <FileText className="w-8 h-8 text-violet-400" />
      </div>
      <div>
        <p className="font-semibold text-foreground mb-1">No orders yet</p>
        <p className="text-sm text-muted-foreground">
          Ready to get started?{" "}
          <Link href="/student/research" className="text-primary hover:text-primary/80 font-medium underline underline-offset-2">
            Start a proposal
          </Link>
        </p>
      </div>
    </div>
  );
}
