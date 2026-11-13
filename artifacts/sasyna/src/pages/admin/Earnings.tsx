import { useState, useEffect } from "react";
import { Link } from "wouter";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useGetAdminStats } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  Wallet, Clock, TrendingUp, AlertCircle, CheckCircle, XCircle,
  Loader2, Send, CalendarDays, Phone, Building2, Settings, Sparkles, CreditCard
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

type Withdrawal = {
  id: string;
  amount: number;
  status: string;
  walletType?: string;
  walletMpesaNumber?: string;
  walletBankName?: string;
  walletBankAccountNumber?: string;
  walletBankAccountName?: string;
  notes?: string;
  superadminNotes?: string;
  requestedAt: string;
  processedAt?: string;
  paidAt?: string;
};

type WalletDetails = {
  walletType: string | null;
  walletMpesaNumber: string | null;
  walletBankName: string | null;
  walletBankAccountNumber: string | null;
  walletBankAccountName: string | null;
};

type OpenStatus = {
  isOpen: boolean;
  mode?: "day" | "range";
  dayName: string;
  withdrawalDayName: string | null;
  daysUntilWithdrawal: number;
  openHour: number | null;
  closeHour: number | null;
  windowStart?: string | null;
  windowEnd?: string | null;
};

const API_BASE = "/api";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

async function fetchWithdrawals(): Promise<Withdrawal[]> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/withdrawals/my`, { headers: auth });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

async function fetchWalletDetails(): Promise<WalletDetails> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/profile/wallet`, { headers: auth });
  if (!res.ok) throw new Error("Failed to fetch wallet");
  return res.json();
}

async function fetchOpenStatus(): Promise<OpenStatus> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/withdrawals/open-status`, { headers: auth });
  if (!res.ok) throw new Error("Failed to fetch status");
  return res.json();
}

async function requestWithdrawal(notes: string): Promise<Withdrawal> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/withdrawals/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify({ notes }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to submit request");
  return data;
}

const STATUS_COLORS: Record<string, string> = {
  pending:  "text-amber-400 bg-amber-500/10 ring-amber-500/30",
  approved: "text-blue-400 bg-blue-500/10 ring-blue-500/30",
  paid:     "text-emerald-400 bg-emerald-500/10 ring-emerald-500/30",
  rejected: "text-red-400 bg-red-500/10 ring-red-500/30",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "pending") return <Clock className="w-3.5 h-3.5" />;
  if (status === "approved") return <CheckCircle className="w-3.5 h-3.5" />;
  if (status === "paid") return <CheckCircle className="w-3.5 h-3.5" />;
  if (status === "rejected") return <XCircle className="w-3.5 h-3.5" />;
  return null;
}

function formatHour(h: number) {
  if (h === 0) return "12:00 AM";
  if (h < 12) return `${h}:00 AM`;
  if (h === 12) return "12:00 PM";
  return `${h - 12}:00 PM`;
}

function Orbs() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
      <div className="absolute -top-24 -right-24 w-[420px] h-[420px] rounded-full bg-emerald-600/7 blur-[100px] animate-pulse" style={{ animationDuration: "7s" }} />
      <div className="absolute bottom-0 -left-20 w-[350px] h-[350px] rounded-full bg-blue-500/6 blur-[90px] animate-pulse" style={{ animationDuration: "9s", animationDelay: "3s" }} />
      <div className="absolute top-1/2 right-1/4 w-[280px] h-[280px] rounded-full bg-amber-500/5 blur-[80px] animate-pulse" style={{ animationDuration: "11s", animationDelay: "5s" }} />
    </div>
  );
}

export default function AdminEarnings() {
  const { data: stats } = useGetAdminStats();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [withdrawals, setWithdrawals] = useState<Withdrawal[] | null>(null);
  const [loadingWithdrawals, setLoadingWithdrawals] = useState(false);
  const [withdrawalsLoaded, setWithdrawalsLoaded] = useState(false);
  const [walletDetails, setWalletDetails] = useState<WalletDetails | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [openStatus, setOpenStatus] = useState<OpenStatus | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const pendingWallet = Number(stats?.pendingWallet) || 0;
  const walletBalance = Number(stats?.walletBalance) || 0;
  const awaitingBalanceAmount = Number((stats as any)?.awaitingBalanceAmount) || 0;

  const dayName = openStatus?.dayName ?? "...";
  const withdrawalDayName = openStatus?.withdrawalDayName ?? "...";
  const canWithdraw = openStatus?.isOpen ?? false;
  const daysUntil = openStatus?.daysUntilWithdrawal ?? 0;
  const openHour = openStatus?.openHour ?? null;
  const closeHour = openStatus?.closeHour ?? null;
  const isRangeMode = openStatus?.mode === "range";
  const windowStart = openStatus?.windowStart ?? null;
  const windowEnd = openStatus?.windowEnd ?? null;

  useEffect(() => {
    fetchWalletDetails().then(setWalletDetails).catch(() => setWalletDetails(null)).finally(() => setLoadingWallet(false));
    fetchOpenStatus().then(setOpenStatus).catch(() => setOpenStatus(null));
  }, []);

  const hasWallet = !!walletDetails?.walletType;

  const loadWithdrawals = async () => {
    if (withdrawalsLoaded) return;
    setLoadingWithdrawals(true);
    try {
      const data = await fetchWithdrawals();
      setWithdrawals(data);
      setWithdrawalsLoaded(true);
    } catch {
      toast({ title: "Error", description: "Failed to load withdrawal history", variant: "destructive" });
    } finally {
      setLoadingWithdrawals(false);
    }
  };

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await requestWithdrawal(notes.trim());
      toast({ title: "Withdrawal Requested!", description: "Your request has been submitted." });
      setShowForm(false); setNotes(""); setWithdrawalsLoaded(false);
      const data = await fetchWithdrawals();
      setWithdrawals(data); setWithdrawalsLoaded(true);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to submit", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  function walletSummary(w: WalletDetails) {
    if (w.walletType === "mpesa") return `M-Pesa: ${w.walletMpesaNumber}`;
    if (w.walletType === "bank") return `${w.walletBankName} · ${w.walletBankAccountNumber} · ${w.walletBankAccountName}`;
    return "Not set";
  }

  function withdrawalPaymentDisplay(w: Withdrawal) {
    if (w.walletType === "mpesa") return `M-Pesa: ${w.walletMpesaNumber || "—"}`;
    if (w.walletType === "bank") return `${w.walletBankName || "—"} · ${w.walletBankAccountNumber || "—"}`;
    return w.walletMpesaNumber || "—";
  }

  return (
    <DashboardLayout>
      <Orbs />

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">Wallet</span>
        </div>
        <h1 className="text-3xl font-extrabold text-foreground tracking-tight">My Earnings</h1>
        <p className="mt-1.5 text-muted-foreground">Track your wallet balance and manage withdrawals.</p>
      </motion.div>

      {/* Balance Cards */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.1, ease: EASE }}
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Pending Earnings", value: pendingWallet, sub: "Locked until orders complete", icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10", ring: "ring-amber-500/20", gradient: "from-amber-500/15" },
          { label: "Awaiting Balance", value: awaitingBalanceAmount, sub: "Student yet to pay order balance", icon: CreditCard, color: "text-violet-400", bg: "bg-violet-500/10", ring: "ring-violet-500/20", gradient: "from-violet-500/15" },
          { label: "Available Balance", value: walletBalance, sub: isRangeMode
              ? (windowStart && windowEnd
                  ? `Window: ${new Date(windowStart).toLocaleDateString("en-KE", { month: "short", day: "numeric" })}–${new Date(windowEnd).toLocaleDateString("en-KE", { month: "short", day: "numeric" })}`
                  : "Withdrawal window not set")
              : `Withdrawals: ${withdrawalDayName}s${openHour !== null && closeHour !== null ? ` (${formatHour(openHour)}–${formatHour(closeHour)})` : ""}`,
            icon: Wallet, color: "text-emerald-400", bg: "bg-emerald-500/10", ring: "ring-emerald-500/20", gradient: "from-emerald-500/15" },
          { label: "Total Earnings", value: pendingWallet + awaitingBalanceAmount + walletBalance, sub: "Pending + Awaiting + Available", icon: TrendingUp, color: "text-blue-400", bg: "bg-blue-500/10", ring: "ring-blue-500/20", gradient: "from-blue-500/15" },
        ].map(({ label, value, sub, icon: Icon, color, bg, ring, gradient }, i) => (
          <motion.div key={label} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 + i * 0.08 }}
            whileHover={{ y: -4, scale: 1.02 }}
            className={`relative overflow-hidden rounded-2xl border bg-card/70 backdrop-blur-sm shadow-lg ring-1 ${ring} p-5`}>
            <div className={`absolute inset-0 bg-gradient-to-br ${gradient} via-transparent to-transparent pointer-events-none`} />
            <div className="relative">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${bg}`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div className={`text-2xl font-extrabold ${color}`}>{formatCurrency(value)}</div>
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
              <div className="text-[11px] text-muted-foreground/60 mt-1">{sub}</div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Payment Details */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.25, ease: EASE }}
        className="bg-card/70 backdrop-blur-sm border border-border rounded-2xl shadow-sm ring-1 ring-border/50 mb-5 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-gradient-to-r from-muted/30 to-transparent">
          <div className="flex items-center gap-2.5">
            {walletDetails?.walletType === "mpesa" ? (
              <Phone className="w-4 h-4 text-emerald-400" />
            ) : walletDetails?.walletType === "bank" ? (
              <Building2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <Wallet className="w-4 h-4 text-muted-foreground" />
            )}
            <span className="text-sm font-bold text-foreground">Payment Details</span>
          </div>
          <Link href="/admin/wallet-settings" className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-medium transition-colors">
            <Settings className="w-4 h-4" /> Edit
          </Link>
        </div>
        <div className="p-5">
          {loadingWallet ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
          ) : hasWallet ? (
            <div className="flex items-center gap-3 p-4 bg-emerald-500/8 border border-emerald-500/20 rounded-xl">
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <div className="text-sm font-semibold text-foreground capitalize">{walletDetails!.walletType === "mpesa" ? "M-Pesa" : "Bank Account"}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{walletSummary(walletDetails!)}</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 bg-amber-500/8 border border-amber-500/20 rounded-xl">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <div className="text-sm font-semibold text-amber-200">No payment details set</div>
                <div className="text-xs text-amber-300/80 mt-0.5">
                  <Link href="/admin/wallet-settings" className="underline font-medium">Set up your wallet</Link> before requesting a withdrawal.
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Withdrawal Section */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.3, ease: EASE }}
        className="bg-card/70 backdrop-blur-sm border border-border rounded-2xl shadow-sm ring-1 ring-border/50 mb-5 overflow-hidden">
        <div className="px-5 py-4 border-b border-border/50 bg-gradient-to-r from-muted/30 to-transparent flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-foreground">Withdrawal</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Today is <span className="font-semibold text-foreground">{dayName}</span>.
              {canWithdraw ? (
                <span className="text-emerald-400 font-semibold"> Withdrawals are open now!</span>
              ) : openStatus ? (
                isRangeMode ? (
                  windowStart && windowEnd ? (
                    <span> Opens{" "}
                      <strong>{new Date(windowStart).toLocaleString("en-KE", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</strong>
                      {" "}— closes{" "}
                      <strong>{new Date(windowEnd).toLocaleString("en-KE", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</strong>.
                    </span>
                  ) : <span> No withdrawal window has been set.</span>
                ) : (
                  <span> Opens every <strong>{withdrawalDayName}</strong>{openHour !== null && closeHour !== null ? <> {formatHour(openHour)}–{formatHour(closeHour)}</> : null}.{daysUntil > 0 ? ` ${daysUntil} day${daysUntil > 1 ? "s" : ""} away.` : ""}</span>
                )
              ) : null}
            </p>
          </div>
          {canWithdraw && walletBalance > 0 && hasWallet && !showForm && (
            <motion.button onClick={() => setShowForm(true)} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white shadow-sm shadow-primary/20 whitespace-nowrap"
              style={{ background: "linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)" }}>
              <Send className="w-4 h-4" /> Request Withdrawal
            </motion.button>
          )}
        </div>

        {!canWithdraw && openStatus && (
          <div className="p-5">
            <div className="flex items-start gap-3 bg-amber-500/8 border border-amber-500/20 rounded-xl p-4">
              <CalendarDays className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                {isRangeMode ? (
                  <>
                    <div className="font-semibold text-amber-200 text-sm">Withdrawal window is currently closed</div>
                    <div className="text-xs text-amber-300/80 mt-1">
                      {windowStart && windowEnd ? (
                        <>Opens <strong>{new Date(windowStart).toLocaleString("en-KE", { weekday: "long", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</strong>
                        {" "}— closes <strong>{new Date(windowEnd).toLocaleString("en-KE", { weekday: "long", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</strong>.</>
                      ) : "No withdrawal window has been set. Contact the administrator."}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-semibold text-amber-200 text-sm">Withdrawals open on {withdrawalDayName}s</div>
                    <div className="text-xs text-amber-300/80 mt-1">
                      {openHour !== null && closeHour !== null ? <>Between {formatHour(openHour)} and {formatHour(closeHour)}. </> : null}
                      {daysUntil > 0 ? `Come back in ${daysUntil} day${daysUntil > 1 ? "s" : ""}.` : ""}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {canWithdraw && !hasWallet && (
          <div className="p-5">
            <div className="flex items-start gap-3 bg-amber-500/8 border border-amber-500/20 rounded-xl p-4">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-amber-200 text-sm">Wallet details required</div>
                <div className="text-xs text-amber-300/80 mt-1">
                  <Link href="/admin/wallet-settings" className="underline font-medium">Set up your wallet</Link> before requesting a withdrawal.
                </div>
              </div>
            </div>
          </div>
        )}

        {canWithdraw && walletBalance <= 0 && (
          <div className="p-5">
            <div className="flex items-start gap-3 bg-muted/30 border border-border/50 rounded-xl p-4">
              <AlertCircle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
              <span className="text-sm text-muted-foreground">No available balance to withdraw. Complete more orders to earn.</span>
            </div>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleRequest} className="p-5 space-y-4">
            <div className="bg-blue-500/8 border border-blue-500/20 rounded-xl p-4 text-sm text-blue-300">
              <strong>Amount:</strong> {formatCurrency(walletBalance)} via {walletDetails?.walletType === "mpesa" ? "M-Pesa" : "Bank Account"} ({walletDetails ? walletSummary(walletDetails) : "—"})
            </div>
            <div>
              <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-2">Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional notes..." rows={3}
                className="w-full px-4 py-3 rounded-xl border-2 border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm resize-none transition-colors" />
            </div>
            <div className="flex gap-3">
              <motion.button type="submit" disabled={submitting} whileHover={{ scale: submitting ? 1 : 1.01 }} whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 px-5 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 disabled:opacity-60 transition-colors shadow-sm shadow-primary/20">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {submitting ? "Submitting..." : "Submit Request"}
              </motion.button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-5 py-3 border border-border rounded-xl font-semibold text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        )}
      </motion.div>

      {/* Withdrawal History */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.35, ease: EASE }}
        className="bg-card/70 backdrop-blur-sm border border-border rounded-2xl shadow-sm ring-1 ring-border/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-border/50 bg-gradient-to-r from-muted/30 to-transparent flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">Withdrawal History</h2>
          {!withdrawalsLoaded && (
            <button onClick={loadWithdrawals} disabled={loadingWithdrawals}
              className="text-sm text-primary hover:underline font-medium flex items-center gap-1 transition-colors">
              {loadingWithdrawals && <Loader2 className="w-4 h-4 animate-spin" />} Load History
            </button>
          )}
        </div>
        {!withdrawalsLoaded && !loadingWithdrawals && (
          <div className="p-10 text-center text-muted-foreground text-sm">Click "Load History" to view your withdrawal records.</div>
        )}
        {loadingWithdrawals && (
          <div className="p-10 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        )}
        {withdrawalsLoaded && (
          <div className="overflow-x-auto">
            {(withdrawals?.length ?? 0) === 0 ? (
              <div className="p-10 text-center text-muted-foreground text-sm">No withdrawal requests yet.</div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30">
                    <th className="px-5 py-3.5">Date</th>
                    <th className="px-5 py-3.5">Amount</th>
                    <th className="px-5 py-3.5">Payment</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Notes</th>
                    <th className="px-5 py-3.5">Paid On</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {withdrawals!.map((w, i) => (
                    <motion.tr key={w.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                      className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-4 text-sm text-foreground">{formatDate(w.requestedAt)}</td>
                      <td className="px-5 py-4 text-sm font-bold text-foreground">{formatCurrency(Number(w.amount))}</td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">{withdrawalPaymentDisplay(w)}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ring-1 ${STATUS_COLORS[w.status] || "text-muted-foreground bg-muted ring-border"}`}>
                          <StatusIcon status={w.status} />{w.status.charAt(0).toUpperCase() + w.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">
                        {w.status === "rejected" && w.superadminNotes
                          ? <span className="text-red-400 font-medium">{w.superadminNotes}</span>
                          : w.superadminNotes || w.notes || "—"}
                      </td>
                      <td className="px-5 py-4 text-sm text-foreground">{w.paidAt ? formatDate(w.paidAt) : "—"}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
