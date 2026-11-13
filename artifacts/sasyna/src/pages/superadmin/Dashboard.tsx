import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useGetPlatformAnalytics, useGetRevenue } from "@workspace/api-client-react";
import { Loader2, DollarSign, Users, FileText, TrendingUp, Sparkles, AlertCircle, ShieldCheck } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { formatCurrency } from "@/lib/utils";
import { motion } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const scaleIn = {
  hidden: { opacity: 0, scale: 0.88 },
  show: (i: number) => ({ opacity: 1, scale: 1, transition: { duration: 0.45, delay: i * 0.1, ease: EASE } }),
};
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.08, ease: EASE } }),
};

function Orbs() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
      <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full bg-violet-600/8 blur-[100px] animate-pulse" style={{ animationDuration: "6s" }} />
      <div className="absolute top-1/2 -left-40 w-[420px] h-[420px] rounded-full bg-emerald-500/7 blur-[120px] animate-pulse" style={{ animationDuration: "8s", animationDelay: "2s" }} />
      <div className="absolute bottom-0 right-1/3 w-[360px] h-[360px] rounded-full bg-blue-500/6 blur-[100px] animate-pulse" style={{ animationDuration: "10s", animationDelay: "4s" }} />
      <div className="absolute inset-0 opacity-[0.025]"
        style={{ backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
    </div>
  );
}

const STAT_CONFIG = [
  {
    key: "revenue", label: "Total Revenue", icon: DollarSign,
    gradient: "from-emerald-500/20 via-teal-500/10 to-transparent", glow: "shadow-emerald-500/20", ring: "ring-emerald-500/30",
    iconBg: "bg-emerald-500/15", iconColor: "text-emerald-400",
  },
  {
    key: "orders", label: "Total Orders", icon: FileText,
    gradient: "from-blue-500/20 via-sky-500/10 to-transparent", glow: "shadow-blue-500/20", ring: "ring-blue-500/30",
    iconBg: "bg-blue-500/15", iconColor: "text-blue-400",
  },
  {
    key: "students", label: "Students", icon: Users,
    gradient: "from-violet-500/20 via-purple-500/10 to-transparent", glow: "shadow-violet-500/20", ring: "ring-violet-500/30",
    iconBg: "bg-violet-500/15", iconColor: "text-violet-400",
  },
  {
    key: "admins", label: "Researchers", icon: Users,
    gradient: "from-amber-500/20 via-orange-500/10 to-transparent", glow: "shadow-amber-500/20", ring: "ring-amber-500/30",
    iconBg: "bg-amber-500/15", iconColor: "text-amber-400",
  },
] as const;

const CHART_COLORS: Record<string, string> = { Deposits: "#6366f1", Balances: "#8b5cf6", Refunds: "#ef4444", "Net Total": "#10b981" };

export default function SuperAdminDashboard() {
  const { data: analytics, isLoading: analyticsLoading } = useGetPlatformAnalytics();
  const { data: revenue, isLoading: revenueLoading } = useGetRevenue({ period: "alltime" });

  const chartData = [
    { name: "Deposits", amount: revenue?.totalDeposits || 0 },
    { name: "Balances", amount: revenue?.totalBalances || 0 },
    ...((revenue?.totalRefunds || 0) > 0 ? [{ name: "Refunds", amount: revenue?.totalRefunds || 0 }] : []),
    { name: "Net Total", amount: revenue?.totalRevenue || 0 },
  ];

  const statValues: Record<string, string | number> = {
    revenue: formatCurrency(revenue?.totalRevenue || 0),
    orders: analytics?.totalOrders || 0,
    students: analytics?.totalStudents || 0,
    admins: analytics?.totalAdmins || 0,
  };

  const rev = revenue as (typeof revenue & {
    totalPendingDisbursement?: number;
    totalLockedAdminEarnings?: number;
    unclaimedOrdersRevenue?: number;
    trueSystemRevenue?: number;
  }) | undefined;

  if (analyticsLoading || revenueLoading) return (
    <DashboardLayout>
      <Orbs />
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-4 border-violet-500/20" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-violet-500 animate-spin" />
        </div>
        <p className="text-muted-foreground text-sm">Loading platform analytics…</p>
      </div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <Orbs />

      <motion.div variants={fadeUp} custom={0} initial="hidden" animate="show" className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <span className="text-xs font-semibold uppercase tracking-widest text-violet-400">Super Admin</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">Platform Overview</h1>
        <p className="mt-1.5 text-muted-foreground">Real-time analytics and revenue metrics across the platform.</p>
      </motion.div>

      {/* Final System Revenue — hero card at top */}
      <motion.div variants={scaleIn} custom={0} initial="hidden" animate="show" whileHover={{ y: -4, scale: 1.01 }}
        className="relative overflow-hidden rounded-2xl border bg-card/60 backdrop-blur-sm p-5 sm:p-6 shadow-xl ring-1 shadow-indigo-500/25 ring-indigo-500/35 cursor-default mb-4">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 via-blue-500/10 to-transparent pointer-events-none" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-indigo-500/15 shrink-0">
              <ShieldCheck className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <div className="text-[11px] sm:text-xs font-semibold uppercase tracking-widest text-indigo-400 mb-0.5">Platform Bottom Line</div>
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

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-4">
        {STAT_CONFIG.map((stat, i) => (
          <motion.div key={stat.key} variants={scaleIn} custom={i + 1} initial="hidden" animate="show" whileHover={{ y: -4, scale: 1.02 }}
            className={`relative overflow-hidden rounded-2xl border bg-card/60 backdrop-blur-sm p-4 sm:p-5 shadow-lg ring-1 ${stat.glow} ${stat.ring} cursor-default`}>
            <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} pointer-events-none`} />
            <div className="relative flex items-start justify-between mb-3">
              <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center ${stat.iconBg}`}>
                <stat.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${stat.iconColor}`} />
              </div>
              <div className="flex items-center gap-1 text-[10px] sm:text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                <TrendingUp className="w-2.5 h-2.5" /> Live
              </div>
            </div>
            <div className="relative">
              <div className="text-xl sm:text-2xl font-extrabold text-foreground leading-none mb-1 break-all">{statValues[stat.key]}</div>
              <div className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">{stat.label}</div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Ownership breakdown card */}
      <div className="mb-8">
        <motion.div variants={scaleIn} custom={6} initial="hidden" animate="show" whileHover={{ y: -4, scale: 1.02 }}
          className="relative overflow-hidden rounded-2xl border bg-card/60 backdrop-blur-sm p-4 sm:p-5 shadow-lg ring-1 shadow-amber-500/20 ring-amber-500/30 cursor-default">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-transparent pointer-events-none" />
          <div className="relative flex items-start justify-between mb-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center bg-amber-500/15">
              <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
            </div>
            <div className="flex items-center gap-1 text-[10px] sm:text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
              <TrendingUp className="w-2.5 h-2.5" /> Live
            </div>
          </div>
          <div className="relative">
            <div className="text-xl sm:text-2xl font-extrabold text-foreground leading-none mb-1 break-all">
              {formatCurrency(rev?.totalPendingDisbursement ?? 0)}
            </div>
            <div className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pending Disbursement</div>
            <div className="text-[10px] text-muted-foreground/70 mt-1">Researcher wallets + pending/approved withdrawals</div>
          </div>
        </motion.div>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        <motion.div variants={fadeUp} custom={2} initial="hidden" animate="show"
          className="bg-card/60 backdrop-blur-sm rounded-2xl border border-border shadow-lg ring-1 ring-border/50 p-6 sm:p-7">
          <h2 className="text-lg font-bold text-foreground mb-6">Revenue Breakdown</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barSize={52}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 13 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), "Amount"]}
                  contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "12px", color: "hsl(var(--foreground))", boxShadow: "0 10px 30px rgba(0,0,0,0.2)" }} />
                <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                  {chartData.map((entry, i) => <Cell key={i} fill={CHART_COLORS[entry.name as keyof typeof CHART_COLORS] || "#6366f1"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div variants={fadeUp} custom={3} initial="hidden" animate="show"
          className="bg-card/60 backdrop-blur-sm rounded-2xl border border-border shadow-lg ring-1 ring-border/50 p-6 sm:p-7">
          <h2 className="text-lg font-bold text-foreground mb-6">Researcher Performance</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30 rounded-xl">
                  <th className="px-4 py-3 rounded-l-xl">Researcher</th>
                  <th className="px-4 py-3">Completed</th>
                  <th className="px-4 py-3 text-right rounded-r-xl">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {revenue?.adminBreakdown?.map((admin: { adminId: string; adminName: string; completedOrders: number; totalRevenue: number }, idx: number) => (
                  <tr key={idx} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                          {admin.adminName?.charAt(0).toUpperCase() || "R"}
                        </div>
                        <span className="font-medium text-foreground text-sm">{admin.adminName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground text-sm">{admin.completedOrders}</td>
                    <td className="px-4 py-4 text-right font-bold text-emerald-400 text-sm">{formatCurrency(admin.totalRevenue)}</td>
                  </tr>
                ))}
                {(!revenue?.adminBreakdown || revenue.adminBreakdown.length === 0) && (
                  <tr><td colSpan={3} className="px-4 py-10 text-center text-muted-foreground text-sm">No performance data yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
