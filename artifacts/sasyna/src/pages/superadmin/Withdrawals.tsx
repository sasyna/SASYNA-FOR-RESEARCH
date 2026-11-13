import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Loader2, CheckCircle, XCircle, Clock, DollarSign, AlertCircle, Phone, Building2,
  Settings, Save, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Calendar, Filter,
  FileText, ExternalLink, Eye, X, BookOpen, Download, Sparkles, TrendingUp
} from "lucide-react";
import { exportToPdf } from "@/lib/exportPdf";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
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

type Withdrawal = {
  id: string; adminId: string; adminName: string; adminEmail: string;
  amount: number; status: string; walletType?: string;
  walletMpesaNumber?: string; walletBankName?: string;
  walletBankAccountNumber?: string; walletBankAccountName?: string;
  nationalId?: string; phoneNumber?: string;
  notes?: string; superadminNotes?: string;
  requestedAt: string; processedAt?: string; paidAt?: string;
};

type ResearcherOrder = {
  id: string; orderId: string; researchTopic: string; serviceType?: string;
  levelOfStudy?: string; totalAmount: number; adminShare?: number;
  completedFileUrl?: string; completedFileLink?: string;
  completedAt?: string; status: string; depositPaid?: boolean; balancePaid?: boolean;
};

type ResearcherOrdersData = { adminId: string; adminName: string; orders: ResearcherOrder[]; };
type WithdrawalSettings = {
  withdrawalDay: number;
  openHour: number;
  closeHour: number;
  isOpen: boolean;
  mode: "day" | "range";
  windowStart?: string | null;
  windowEnd?: string | null;
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const API_BASE = "/api";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

async function fetchResearcherOrders(withdrawalId: string): Promise<ResearcherOrdersData> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/withdrawals/${withdrawalId}/researcher-orders`, { headers: auth });
  if (!res.ok) throw new Error("Failed to fetch researcher orders");
  return res.json();
}

async function fetchAll(date?: string, status?: string): Promise<Withdrawal[]> {
  const auth = await getAuthHeaders();
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (status && status !== "all") params.set("status", status);
  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`${API_BASE}/withdrawals/all${query}`, { headers: auth });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

async function fetchSettings(): Promise<WithdrawalSettings> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/superadmin/withdrawal-settings`, { headers: auth });
  if (!res.ok) throw new Error("Failed to fetch settings");
  return res.json();
}

async function saveSettings(s: WithdrawalSettings): Promise<void> {
  const auth = await getAuthHeaders();
  const body = s.mode === "range"
    ? { isOpen: s.isOpen, windowStart: s.windowStart, windowEnd: s.windowEnd }
    : { isOpen: s.isOpen, withdrawalDay: s.withdrawalDay, openHour: s.openHour, closeHour: s.closeHour };
  const res = await fetch(`${API_BASE}/superadmin/withdrawal-settings`, {
    method: "PATCH", headers: { "Content-Type": "application/json", ...auth }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Failed to save");
}

async function actionWithdrawal(id: string, endpoint: string, notes?: string): Promise<Withdrawal> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/withdrawals/${id}/${endpoint}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify({ superadminNotes: notes || "" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Action failed");
  return data;
}

function Orbs() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
      <div className="absolute -top-32 -right-32 w-[460px] h-[460px] rounded-full bg-emerald-600/8 blur-[100px] animate-pulse" style={{ animationDuration: "7s" }} />
      <div className="absolute bottom-0 -left-20 w-[380px] h-[380px] rounded-full bg-blue-500/7 blur-[110px] animate-pulse" style={{ animationDuration: "9s", animationDelay: "2s" }} />
      <div className="absolute inset-0 opacity-[0.02]"
        style={{ backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
    </div>
  );
}

function statusColor(status: string) {
  switch (status) {
    case "pending": return "bg-amber-500/15 text-amber-400";
    case "approved": return "bg-blue-500/15 text-blue-400";
    case "paid": return "bg-emerald-500/15 text-emerald-400";
    case "rejected": return "bg-red-500/15 text-red-400";
    default: return "bg-muted text-muted-foreground";
  }
}

function WalletDisplay({ w }: { w: Withdrawal }) {
  if (w.walletType === "mpesa") {
    return (
      <div className="flex items-center gap-1.5">
        <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <div>
          <div className="text-xs font-medium text-foreground">M-Pesa</div>
          <div className="text-xs text-muted-foreground font-mono">{w.walletMpesaNumber || "—"}</div>
        </div>
      </div>
    );
  }
  if (w.walletType === "bank") {
    return (
      <div className="flex items-start gap-1.5">
        <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
        <div>
          <div className="text-xs font-medium text-foreground">{w.walletBankName || "Bank"}</div>
          <div className="text-xs text-muted-foreground font-mono">{w.walletBankAccountNumber || "—"}</div>
          <div className="text-xs text-muted-foreground">{w.walletBankAccountName || "—"}</div>
        </div>
      </div>
    );
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}

function ResearcherOrdersModal({ withdrawalId, onClose }: { withdrawalId: string; onClose: () => void }) {
  const [data, setData] = useState<ResearcherOrdersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchResearcherOrders(withdrawalId)
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e instanceof Error ? e.message : "Failed to load"); setLoading(false); });
  }, [withdrawalId]);

  const orderStatusColor = (status: string) => {
    switch (status) {
      case "ready_for_download": return "bg-teal-500/15 text-teal-400";
      case "completed": return "bg-emerald-500/15 text-emerald-400";
      case "awaiting_balance": return "bg-blue-500/15 text-blue-400";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.3, ease: EASE }}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-5 border-b border-border flex items-center justify-between shrink-0 bg-gradient-to-r from-muted/40 to-transparent">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <BookOpen className="w-5 h-5 text-primary" />
              <h3 className="font-bold text-foreground">{loading ? "Loading..." : `${data?.adminName}'s Completed Orders`}</h3>
            </div>
            <p className="text-xs text-muted-foreground">Orders that generated this withdrawal amount</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : error ? (
            <div className="text-center py-12 text-destructive flex items-center justify-center gap-2"><AlertCircle className="w-5 h-5" /> {error}</div>
          ) : !data || data.orders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No completed orders found</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-sm text-blue-400">
                <strong>{data.orders.length}</strong> completed order{data.orders.length !== 1 ? "s" : ""} found. Review documents before approving.
              </div>
              {data.orders.map((order, idx) => (
                <div key={order.id} className="bg-card border border-border rounded-xl p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-xs font-bold text-primary">{order.orderId || `#${idx + 1}`}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${orderStatusColor(order.status)}`}>
                          {order.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                        </span>
                      </div>
                      <h4 className="font-semibold text-foreground text-sm leading-snug">{order.researchTopic}</h4>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-muted-foreground">Share</div>
                      <div className="font-bold text-foreground">{formatCurrency(Number(order.adminShare) || Number(order.totalAmount) * 0.5)}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {order.serviceType && <span className="bg-muted px-2 py-1 rounded-lg">{order.serviceType}</span>}
                    {order.levelOfStudy && <span className="bg-muted px-2 py-1 rounded-lg">{order.levelOfStudy}</span>}
                    {order.completedAt && <span>Completed: {formatDate(order.completedAt)}</span>}
                    <span className={order.balancePaid ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>
                      {order.balancePaid ? "✓ Fully paid" : "Deposit only"}
                    </span>
                  </div>
                  {(order.completedFileLink || order.completedFileUrl) ? (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Document Links</div>
                      {order.completedFileLink && (
                        <a href={order.completedFileLink} target="_blank" rel="noreferrer"
                          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition-colors">
                          <ExternalLink className="w-4 h-4 shrink-0" />
                          <span className="truncate">{order.completedFileLink}</span>
                        </a>
                      )}
                      {order.completedFileUrl && order.completedFileUrl !== order.completedFileLink && (
                        <a href={order.completedFileUrl} target="_blank" rel="noreferrer"
                          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition-colors">
                          <FileText className="w-4 h-4 shrink-0" />
                          <span className="truncate">{order.completedFileUrl}</span>
                        </a>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground italic bg-muted/40 rounded-lg p-2">No document URL uploaded.</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function fmtDt(iso: string, opts?: Intl.DateTimeFormatOptions) {
  return new Date(iso).toLocaleString("en-KE", opts ?? { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function WithdrawalSettingsPanel() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<WithdrawalSettings>({
    withdrawalDay: 4, openHour: 8, closeHour: 17, isOpen: true, mode: "day", windowStart: null, windowEnd: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchSettings().then(s => { setSettings(s); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSettings(settings);
      toast({ title: "Settings saved", description: "Withdrawal settings updated successfully." });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const hourOptions = Array.from({ length: 24 }, (_, h) => ({
    value: h, label: h === 0 ? "12:00 AM" : h < 12 ? `${h}:00 AM` : h === 12 ? "12:00 PM" : `${h - 12}:00 PM`,
  }));

  const summaryText = loading ? "Loading..." : settings.mode === "range" && settings.windowStart && settings.windowEnd
    ? `${fmtDt(settings.windowStart)} → ${fmtDt(settings.windowEnd)} · ${settings.isOpen ? "Open" : "Closed"}`
    : `Every ${DAY_NAMES[settings.withdrawalDay]}, ${settings.openHour}:00–${settings.closeHour}:00 · ${settings.isOpen ? "Open" : "Closed"}`;

  return (
    <div className="bg-card/60 backdrop-blur-sm border border-border rounded-2xl shadow-lg ring-1 ring-border/50 mb-8">
      <button onClick={() => setExpanded(e => !e)}
        className="w-full p-5 flex items-center justify-between text-left hover:bg-muted/20 rounded-2xl transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary"><Settings className="w-5 h-5" /></div>
          <div>
            <div className="font-bold text-foreground">Withdrawal Settings</div>
            <div className="text-xs text-muted-foreground mt-0.5">{summaryText}</div>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="border-t border-border/60 p-5 space-y-5">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <>
              {/* Master open/close toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-foreground">Withdrawal Window</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Enable or disable withdrawal requests platform-wide</div>
                </div>
                <button onClick={() => setSettings(s => ({ ...s, isOpen: !s.isOpen }))}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${settings.isOpen ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                  {settings.isOpen ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                  {settings.isOpen ? "Open" : "Closed"}
                </button>
              </div>

              {/* Mode toggle */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Window Type</label>
                <div className="flex gap-2">
                  <button onClick={() => setSettings(s => ({ ...s, mode: "day" }))}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${settings.mode === "day" ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "bg-muted/60 text-muted-foreground hover:bg-muted"}`}>
                    Weekly Day
                  </button>
                  <button onClick={() => setSettings(s => ({ ...s, mode: "range" }))}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${settings.mode === "range" ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "bg-muted/60 text-muted-foreground hover:bg-muted"}`}>
                    <Calendar className="w-4 h-4" /> Date Range
                  </button>
                </div>
              </div>

              {settings.mode === "day" ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Withdrawal Request Day</label>
                    <div className="flex flex-wrap gap-2">
                      {DAY_NAMES.map((day, idx) => (
                        <button key={idx} onClick={() => setSettings(s => ({ ...s, withdrawalDay: idx }))}
                          className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${settings.withdrawalDay === idx ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "bg-muted/60 text-muted-foreground hover:bg-muted"}`}>
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {[{ label: "Opening Hour", field: "openHour" }, { label: "Closing Hour", field: "closeHour" }].map(({ label, field }) => (
                      <div key={field}>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{label}</label>
                        <select value={settings[field as keyof WithdrawalSettings] as number}
                          onChange={e => setSettings(s => ({ ...s, [field]: Number(e.target.value) }))}
                          className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                          {hourOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-sm text-blue-400">
                    Requests allowed every <strong>{DAY_NAMES[settings.withdrawalDay]}</strong> between{" "}
                    <strong>{hourOptions[settings.openHour]?.label}</strong> and <strong>{hourOptions[settings.closeHour]?.label}</strong>.
                    Window is <strong>{settings.isOpen ? "open" : "closed"}</strong>.
                  </div>
                </>
              ) : (
                <>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Window Opens</label>
                      <input type="datetime-local"
                        value={toLocalInput(settings.windowStart)}
                        onChange={e => setSettings(s => ({
                          ...s, windowStart: e.target.value ? new Date(e.target.value).toISOString() : null,
                        }))}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Window Closes</label>
                      <input type="datetime-local"
                        value={toLocalInput(settings.windowEnd)}
                        onChange={e => setSettings(s => ({
                          ...s, windowEnd: e.target.value ? new Date(e.target.value).toISOString() : null,
                        }))}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                    </div>
                  </div>
                  {settings.windowStart && settings.windowEnd ? (
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-sm text-blue-400">
                      Requests allowed from{" "}
                      <strong>{fmtDt(settings.windowStart, { weekday: "long", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</strong>
                      {" "}to{" "}
                      <strong>{fmtDt(settings.windowEnd, { weekday: "long", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</strong>.
                      Window is <strong>{settings.isOpen ? "open" : "closed"}</strong>.
                    </div>
                  ) : (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-sm text-amber-400">
                      Pick a start and end date/time for the withdrawal window.
                    </div>
                  )}
                </>
              )}

              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors shadow-md shadow-primary/25">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Settings
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function SuperAdminWithdrawals() {
  const { toast } = useToast();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [notesModal, setNotesModal] = useState<{ id: string; action: "approve" | "reject" | "mark-paid" } | null>(null);
  const [notesText, setNotesText] = useState("");
  const [viewOrdersModal, setViewOrdersModal] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const loadData = async (date?: string, status?: string) => {
    setLoading(true);
    try {
      const data = await fetchAll(date, status);
      setWithdrawals(data);
    } catch {
      toast({ title: "Error", description: "Failed to load withdrawals", variant: "destructive" });
    } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const applyFilters = () => { loadData(filterDate || undefined, filterStatus); };
  const clearFilters = () => { setFilterDate(""); setFilterStatus("all"); loadData(); };

  const handleAction = async (id: string, act: "approve" | "reject" | "mark-paid", notes?: string) => {
    setProcessing(id);
    try {
      const updated = await actionWithdrawal(id, act, notes);
      setWithdrawals(prev => prev.map(w => w.id === id ? { ...w, ...updated } : w));
      const messages = {
        "approve": "Withdrawal approved. Send the payment and then mark as paid.",
        "reject": "Withdrawal request rejected. The amount has been refunded to their wallet.",
        "mark-paid": "Marked as paid successfully.",
      };
      toast({ title: "Success", description: messages[act] });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Action failed", variant: "destructive" });
    } finally { setProcessing(null); setNotesModal(null); setNotesText(""); }
  };

  const openModal = (id: string, act: "approve" | "reject" | "mark-paid") => { setNotesModal({ id, action: act }); setNotesText(""); };

  const pending = withdrawals.filter(w => w.status === "pending");
  const approved = withdrawals.filter(w => w.status === "approved");
  const paid = withdrawals.filter(w => w.status === "paid");
  const rejected = withdrawals.filter(w => w.status === "rejected");
  const totalPendingAmount = pending.reduce((s, w) => s + Number(w.amount), 0);
  const totalApprovedAmount = approved.reduce((s, w) => s + Number(w.amount), 0);
  const totalPaidAmount = paid.reduce((s, w) => s + Number(w.amount), 0);
  const totalRejectedAmount = rejected.reduce((s, w) => s + Number(w.amount), 0);
  const totalUnpaidAmount = [...pending, ...approved].reduce((s, w) => s + Number(w.amount), 0);

  const statCards = [
    { label: "Pending", value: formatCurrency(totalPendingAmount), sub: `${pending.length} requests`, gradient: "from-amber-500/20 via-orange-500/10 to-transparent", glow: "shadow-amber-500/20", ring: "ring-amber-500/30", iconBg: "bg-amber-500/15", iconColor: "text-amber-400", icon: Clock },
    { label: "Approved", value: formatCurrency(totalApprovedAmount), sub: `${approved.length} awaiting payment`, gradient: "from-blue-500/20 via-sky-500/10 to-transparent", glow: "shadow-blue-500/20", ring: "ring-blue-500/30", iconBg: "bg-blue-500/15", iconColor: "text-blue-400", icon: CheckCircle },
    { label: "Total Paid", value: formatCurrency(totalPaidAmount), sub: `${paid.length} completed`, gradient: "from-emerald-500/20 via-teal-500/10 to-transparent", glow: "shadow-emerald-500/20", ring: "ring-emerald-500/30", iconBg: "bg-emerald-500/15", iconColor: "text-emerald-400", icon: DollarSign },
    { label: "Rejected", value: formatCurrency(totalRejectedAmount), sub: `${rejected.length} rejected`, gradient: "from-red-500/20 via-rose-500/10 to-transparent", glow: "shadow-red-500/20", ring: "ring-red-500/30", iconBg: "bg-red-500/15", iconColor: "text-red-400", icon: XCircle },
  ];

  return (
    <DashboardLayout>
      <Orbs />

      {/* Notes Modal */}
      {notesModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25, ease: EASE }}
            className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-foreground text-lg capitalize">{notesModal.action.replace("-", " ")} Withdrawal</h3>
              <button onClick={() => setNotesModal(null)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notes (optional)</label>
            <textarea rows={3} value={notesText} onChange={e => setNotesText(e.target.value)}
              placeholder={`Add notes for this ${notesModal.action}...`}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 resize-none mb-4" />
            <div className="flex gap-3">
              <button onClick={() => handleAction(notesModal.id, notesModal.action, notesText)} disabled={!!processing}
                className={`flex-1 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-60 transition-colors flex items-center justify-center gap-2 ${notesModal.action === "reject" ? "bg-red-500 text-white hover:bg-red-600" : "bg-primary text-primary-foreground hover:bg-primary/90"} shadow-md`}>
                {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Confirm {notesModal.action.replace("-", " ").replace(/\b\w/g, l => l.toUpperCase())}
              </button>
              <button onClick={() => setNotesModal(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-border text-muted-foreground hover:bg-muted transition-colors">
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {viewOrdersModal && (
        <ResearcherOrdersModal withdrawalId={viewOrdersModal} onClose={() => setViewOrdersModal(null)} />
      )}

      <motion.div variants={fadeUp} custom={0} initial="hidden" animate="show"
        className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Payouts</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">Withdrawal Requests</h1>
          <p className="mt-1.5 text-muted-foreground">Review and process researcher withdrawal requests.</p>
        </div>
        <div className="flex items-center gap-3">
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => {
              if (!approved.length) return;
              exportToPdf({
                title: "Approved Withdrawals — Payment Sheet",
                subtitle: `${approved.length} approved request${approved.length !== 1 ? "s" : ""} · Total: ${formatCurrency(totalApprovedAmount)} · Generated ${new Date().toLocaleDateString("en-GB")}`,
                filename: `approved-withdrawals-payment-${new Date().toISOString().slice(0, 10)}.pdf`,
                columns: [
                  { header: "#", dataKey: "num" },
                  { header: "Researcher", dataKey: "adminName" },
                  { header: "National ID", dataKey: "nationalId" },
                  { header: "Phone", dataKey: "phoneNumber" },
                  { header: "Wallet", dataKey: "walletType" },
                  { header: "M-Pesa No. / Bank", dataKey: "walletDetails" },
                  { header: "Account No.", dataKey: "accountNumber" },
                  { header: "Account Name", dataKey: "accountName" },
                  { header: "Amount (KES)", dataKey: "amount" },
                  { header: "Approved On", dataKey: "requestedAt" },
                ],
                rows: approved.map((w, i) => ({
                  num: String(i + 1),
                  adminName: w.adminName || "—",
                  nationalId: w.nationalId || "—",
                  phoneNumber: w.phoneNumber || "—",
                  walletType: w.walletType === "mpesa" ? "M-Pesa" : w.walletType === "bank" ? "Bank" : "—",
                  walletDetails: w.walletType === "mpesa"
                    ? (w.walletMpesaNumber || "—")
                    : w.walletType === "bank"
                      ? (w.walletBankName || "—")
                      : "—",
                  accountNumber: w.walletType === "bank" ? (w.walletBankAccountNumber || "—") : "—",
                  accountName: w.walletType === "bank" ? (w.walletBankAccountName || "—") : "—",
                  amount: formatCurrency(Number(w.amount)),
                  requestedAt: formatDate(w.requestedAt),
                })),
              });
            }}
            disabled={!approved.length}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-all disabled:opacity-50 shadow-md shadow-blue-600/25">
            <Download className="w-4 h-4" /> Export Approved
          </motion.button>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => {
              if (!withdrawals.length) return;
              exportToPdf({
                title: "Withdrawal Requests Report",
                subtitle: `All withdrawals — ${withdrawals.length} records`,
                filename: `withdrawals-report-${new Date().toISOString().slice(0, 10)}.pdf`,
                columns: [
                  { header: "Researcher", dataKey: "adminName" }, { header: "Email", dataKey: "adminEmail" },
                  { header: "Amount", dataKey: "amount" }, { header: "Status", dataKey: "status" },
                  { header: "Wallet Type", dataKey: "walletType" }, { header: "National ID", dataKey: "nationalId" },
                  { header: "Phone", dataKey: "phoneNumber" }, { header: "Requested", dataKey: "requestedAt" },
                  { header: "Notes", dataKey: "superadminNotes" },
                ],
                rows: withdrawals.map(w => ({
                  adminName: w.adminName || "—", adminEmail: w.adminEmail || "—",
                  amount: formatCurrency(Number(w.amount)),
                  status: w.status.replace(/\b\w/g, l => l.toUpperCase()),
                  walletType: w.walletType === "mpesa" ? "M-Pesa" : w.walletType === "bank" ? "Bank" : "—",
                  nationalId: w.nationalId || "—", phoneNumber: w.phoneNumber || "—",
                  requestedAt: formatDate(w.requestedAt), superadminNotes: w.superadminNotes || "—",
                })),
              });
            }}
            disabled={!withdrawals.length}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border bg-card/60 backdrop-blur-sm text-foreground font-medium text-sm hover:bg-muted/60 transition-all disabled:opacity-50 shadow-sm">
            <Download className="w-4 h-4" /> Export All
          </motion.button>
        </div>
      </motion.div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-8">
        {statCards.map((stat, i) => (
          <motion.div key={stat.label} variants={scaleIn} custom={i} initial="hidden" animate="show" whileHover={{ y: -4, scale: 1.02 }}
            className={`relative overflow-hidden rounded-2xl border bg-card/60 backdrop-blur-sm p-4 sm:p-5 shadow-lg ring-1 ${stat.glow} ${stat.ring}`}>
            <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} pointer-events-none`} />
            <div className="relative flex items-start gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${stat.iconBg}`}>
                <stat.icon className={`w-4 h-4 ${stat.iconColor}`} />
              </div>
              <div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-0.5"><TrendingUp className="w-2.5 h-2.5" /> {stat.sub}</div>
                <div className="text-base sm:text-xl font-extrabold text-foreground leading-tight">{stat.value}</div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mt-0.5">{stat.label}</div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Unpaid alert */}
      {totalUnpaidAmount > 0 && (
        <motion.div variants={fadeUp} custom={2} initial="hidden" animate="show"
          className="mb-6 flex items-center justify-between gap-4 p-4 rounded-2xl border border-amber-500/30 bg-amber-500/8 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center"><AlertCircle className="w-5 h-5 text-amber-400" /></div>
            <div>
              <div className="text-sm font-bold text-foreground">Total Unpaid Balance</div>
              <div className="text-xs text-muted-foreground">{pending.length + approved.length} requests pending disbursement</div>
            </div>
          </div>
          <div className="text-lg font-extrabold text-amber-400 shrink-0">{formatCurrency(totalUnpaidAmount)}</div>
        </motion.div>
      )}

      {/* Settings */}
      <motion.div variants={fadeUp} custom={3} initial="hidden" animate="show">
        <WithdrawalSettingsPanel />
      </motion.div>

      {/* Filters */}
      <motion.div variants={fadeUp} custom={4} initial="hidden" animate="show"
        className="bg-card/60 backdrop-blur-sm border border-border rounded-2xl shadow-lg ring-1 ring-border/50 p-5 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Filter by Date
            </label>
            <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
              <Filter className="w-3 h-3" /> Status
            </label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="paid">Paid</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={applyFilters} className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors shadow-md shadow-primary/25">
              Apply
            </button>
            {(filterDate || filterStatus !== "all") && (
              <button onClick={clearFilters} className="px-4 py-2.5 bg-muted/60 text-muted-foreground rounded-xl text-sm font-medium hover:bg-muted transition-colors">
                Clear
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Withdrawals List */}
      <motion.div variants={fadeUp} custom={5} initial="hidden" animate="show">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="relative w-12 h-12"><div className="absolute inset-0 rounded-full border-4 border-emerald-500/20" /><div className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-500 animate-spin" /></div>
            <p className="text-muted-foreground text-sm">Loading withdrawals…</p>
          </div>
        ) : withdrawals.length === 0 ? (
          <div className="bg-card/60 backdrop-blur-sm border border-border rounded-2xl shadow-lg p-16 text-center">
            <DollarSign className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
            <div className="text-foreground font-semibold">No withdrawal requests</div>
            <div className="text-muted-foreground text-sm mt-1">No requests match your current filters.</div>
          </div>
        ) : (
          <div className="space-y-3">
            {withdrawals.map(w => (
              <div key={w.id} className="bg-card/60 backdrop-blur-sm border border-border rounded-2xl shadow-lg ring-1 ring-border/50 p-5 hover:bg-muted/20 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                          {(w.adminName || "R").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-foreground">{w.adminName}</div>
                          <div className="text-xs text-muted-foreground">{w.adminEmail}</div>
                        </div>
                      </div>
                      <span className={`ml-auto sm:ml-0 px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${statusColor(w.status)}`}>{w.status}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="bg-muted/30 rounded-xl p-3">
                        <div className="text-xs text-muted-foreground mb-0.5">Amount</div>
                        <div className="text-lg font-extrabold text-foreground">{formatCurrency(Number(w.amount))}</div>
                      </div>
                      <div className="bg-muted/30 rounded-xl p-3">
                        <div className="text-xs text-muted-foreground mb-1">Wallet</div>
                        <WalletDisplay w={w} />
                      </div>
                      <div className="bg-muted/30 rounded-xl p-3">
                        <div className="text-xs text-muted-foreground mb-0.5">Requested</div>
                        <div className="text-xs text-foreground">{formatDate(w.requestedAt)}</div>
                        {w.processedAt && <div className="text-xs text-muted-foreground mt-0.5">Processed: {formatDate(w.processedAt)}</div>}
                        {w.paidAt && <div className="text-xs text-emerald-400 mt-0.5 font-medium">Paid: {formatDate(w.paidAt)}</div>}
                      </div>
                    </div>
                    {w.nationalId && (
                      <div className="text-xs text-muted-foreground">National ID: <span className="text-foreground font-mono font-medium">{w.nationalId}</span></div>
                    )}
                    {w.notes && (
                      <div className="text-xs bg-muted/30 p-2.5 rounded-xl text-muted-foreground">Note: {w.notes}</div>
                    )}
                    {w.superadminNotes && (
                      <div className="text-xs bg-blue-500/10 border border-blue-500/20 p-2.5 rounded-xl text-blue-400">Admin note: {w.superadminNotes}</div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 shrink-0 sm:items-end">
                    <button onClick={() => setViewOrdersModal(w.id)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 text-primary rounded-xl text-xs font-semibold hover:bg-primary/20 transition-colors w-full sm:w-auto justify-center">
                      <Eye className="w-3.5 h-3.5" /> View Orders
                    </button>
                    {w.status === "pending" && (
                      <>
                        <button onClick={() => openModal(w.id, "approve")} disabled={!!processing}
                          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/15 text-emerald-400 rounded-xl text-xs font-semibold hover:bg-emerald-500/25 transition-colors disabled:opacity-60 w-full sm:w-auto justify-center">
                          {processing === w.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                          Approve
                        </button>
                        <button onClick={() => openModal(w.id, "reject")} disabled={!!processing}
                          className="flex items-center gap-1.5 px-3 py-2 bg-red-500/15 text-red-400 rounded-xl text-xs font-semibold hover:bg-red-500/25 transition-colors disabled:opacity-60 w-full sm:w-auto justify-center">
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </button>
                      </>
                    )}
                    {w.status === "approved" && (
                      <button onClick={() => openModal(w.id, "mark-paid")} disabled={!!processing}
                        className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60 shadow-md shadow-emerald-600/20 w-full sm:w-auto justify-center">
                        {processing === w.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                        Mark as Paid
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
