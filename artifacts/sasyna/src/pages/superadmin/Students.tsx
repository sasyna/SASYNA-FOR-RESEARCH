import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  Loader2, Users, Search, Edit2, Key, CheckCircle, X, RotateCcw,
  Phone, Mail, ClipboardList, Download, FileText, ExternalLink, Filter, Sparkles, TrendingUp
} from "lucide-react";
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

type Student = { id: string; email: string; fullName: string; phoneNumber: string | null; createdAt: string; };
type Order = {
  id: string; orderId: string; researchTopic: string; serviceType: string;
  levelOfStudy: string; status: string; totalAmount: number; depositPaid: boolean;
  balancePaid: boolean; completedFileUrl?: string; completedFileLink?: string; createdAt: string;
};

const STATUS_COLOR: Record<string, string> = {
  pending_payment: "bg-amber-500/15 text-amber-400",
  pending_assignment: "bg-orange-500/15 text-orange-400",
  assigned: "bg-blue-500/15 text-blue-400",
  in_progress: "bg-indigo-500/15 text-indigo-400",
  under_review: "bg-violet-500/15 text-violet-400",
  completed: "bg-emerald-500/15 text-emerald-400",
  awaiting_balance: "bg-cyan-500/15 text-cyan-400",
  ready_for_download: "bg-green-500/15 text-green-400",
  closed: "bg-muted text-muted-foreground",
  refund_requested: "bg-red-500/15 text-red-400",
  refunded: "bg-red-500/20 text-red-300",
};

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

async function fetchStudents(): Promise<Student[]> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/superadmin/students`, { headers: auth });
  if (!res.ok) throw new Error("Failed to fetch students");
  return res.json();
}

async function updateStudent(studentId: string, data: { fullName?: string; phoneNumber?: string }): Promise<void> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/superadmin/students/${studentId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", ...auth }, body: JSON.stringify(data),
  });
  if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to update student"); }
}

async function resetPassword(studentId: string, newPassword: string): Promise<void> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/superadmin/students/${studentId}/reset-password`, {
    method: "POST", headers: { "Content-Type": "application/json", ...auth }, body: JSON.stringify({ newPassword }),
  });
  if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to reset password"); }
}

async function fetchStudentOrders(studentId: string, status?: string): Promise<Order[]> {
  const auth = await getAuthHeaders();
  const params = status ? `?status=${status}` : "";
  const res = await fetch(`${API_BASE}/superadmin/students/${studentId}/orders${params}`, { headers: auth });
  if (!res.ok) throw new Error("Failed to fetch orders");
  return res.json();
}

function StudentOrdersPanel({ student, onClose }: { student: Student; onClose: () => void }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "incomplete">("all");
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchStudentOrders(student.id, statusFilter === "all" ? undefined : statusFilter);
      setOrders(data);
    } catch {
      toast({ title: "Error", description: "Failed to load orders", variant: "destructive" });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [statusFilter]);

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const auth = await getAuthHeaders();
      const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const res = await fetch(`${API_BASE}/superadmin/students/${student.id}/orders/export-pdf${params}`, { headers: auth });
      if (!res.ok) throw new Error((await res.json()).error || "Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${student.fullName?.replace(/\s+/g, "-")}-orders-${statusFilter}-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "PDF Exported", description: "The PDF has been downloaded." });
    } catch (err) {
      toast({ title: "Export Failed", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally { setExporting(false); }
  };

  const formatStatus = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.3, ease: EASE }}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-5 border-b border-border flex items-start justify-between gap-4 shrink-0 bg-gradient-to-r from-muted/40 to-transparent">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                {(student.fullName || student.email || "?").charAt(0).toUpperCase()}
              </div>
              <h2 className="text-lg font-bold text-foreground">{student.fullName || student.email}</h2>
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-2 pl-10">
              <Mail className="w-3 h-3" />{student.email}
              {student.phoneNumber && <><Phone className="w-3 h-3 ml-1" />{student.phoneNumber}</>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground shrink-0"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-5 py-3 border-b border-border flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Filter className="w-3.5 h-3.5" /> Filter:</div>
          {(["all", "completed", "incomplete"] as const).map(f => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-colors ${statusFilter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
              {f}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={load} disabled={loading} className="p-1.5 rounded-lg border border-border bg-background text-muted-foreground hover:bg-muted transition-colors">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            </button>
            <button onClick={handleExportPdf} disabled={exporting || loading || !orders?.length}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors">
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Export PDF
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : !orders?.length ? (
            <div className="py-12 text-center">
              <FileText className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
              <div className="text-foreground font-semibold">No orders found</div>
              <div className="text-sm text-muted-foreground mt-1">{statusFilter !== "all" ? `No ${statusFilter} orders for this student.` : "This student has no orders yet."}</div>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map(order => (
                <div key={order.id} className="border border-border rounded-xl p-4 hover:bg-muted/20 transition-colors">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-xs font-bold text-primary">{order.orderId}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_COLOR[order.status] || "bg-muted text-muted-foreground"}`}>{formatStatus(order.status)}</span>
                        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{order.serviceType}</span>
                      </div>
                      <div className="text-sm font-medium text-foreground truncate">{order.researchTopic}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{order.levelOfStudy} · {formatDate(order.createdAt)}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-foreground text-sm">{formatCurrency(order.totalAmount)}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {order.depositPaid && order.balancePaid ? "Fully Paid" : order.depositPaid ? "Deposit Paid" : "Unpaid"}
                      </div>
                    </div>
                  </div>
                  {(order.completedFileUrl || order.completedFileLink) && (
                    <a href={order.completedFileUrl || order.completedFileLink} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                      <ExternalLink className="w-3 h-3" /> View Document
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {orders && orders.length > 0 && (
          <div className="px-5 py-3 border-t border-border text-xs text-muted-foreground shrink-0">
            {orders.length} order{orders.length !== 1 ? "s" : ""}{statusFilter !== "all" ? ` (${statusFilter})` : ""} — Total: {formatCurrency(orders.reduce((s, o) => s + (o.totalAmount || 0), 0))}
          </div>
        )}
      </motion.div>
    </div>
  );
}

function Orbs() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
      <div className="absolute -top-32 -right-32 w-[460px] h-[460px] rounded-full bg-violet-600/8 blur-[100px] animate-pulse" style={{ animationDuration: "7s" }} />
      <div className="absolute bottom-0 -left-20 w-[380px] h-[380px] rounded-full bg-blue-500/7 blur-[110px] animate-pulse" style={{ animationDuration: "9s", animationDelay: "2s" }} />
      <div className="absolute inset-0 opacity-[0.02]"
        style={{ backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
    </div>
  );
}

export default function SuperAdminStudents() {
  const { toast } = useToast();
  const [students, setStudents] = useState<Student[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetId, setResetId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [viewOrdersStudent, setViewOrdersStudent] = useState<Student | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchStudents();
      setStudents(data);
    } catch {
      toast({ title: "Error", description: "Failed to load students", variant: "destructive" });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = (students || []).filter(s =>
    s.fullName?.toLowerCase().includes(search.toLowerCase()) ||
    s.email?.toLowerCase().includes(search.toLowerCase()) ||
    s.phoneNumber?.includes(search)
  );

  const startEdit = (s: Student) => { setEditingId(s.id); setEditName(s.fullName || ""); setEditPhone(s.phoneNumber || ""); setResetId(null); };
  const cancelEdit = () => { setEditingId(null); setEditName(""); setEditPhone(""); };

  const handleSave = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      await updateStudent(editingId, { fullName: editName, phoneNumber: editPhone });
      setStudents(prev => prev ? prev.map(s => s.id === editingId ? { ...s, fullName: editName, phoneNumber: editPhone } : s) : prev);
      toast({ title: "Saved", description: "Student profile updated." });
      cancelEdit();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const startReset = (id: string) => { setResetId(id); setNewPassword(""); setEditingId(null); };
  const cancelReset = () => { setResetId(null); setNewPassword(""); };

  const handleReset = async () => {
    if (!resetId || newPassword.length < 6) return;
    setResetting(true);
    try {
      await resetPassword(resetId, newPassword);
      toast({ title: "Password Reset", description: "The student's password has been updated." });
      cancelReset();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally { setResetting(false); }
  };

  return (
    <DashboardLayout>
      {viewOrdersStudent && <StudentOrdersPanel student={viewOrdersStudent} onClose={() => setViewOrdersStudent(null)} />}
      <Orbs />

      <motion.div variants={fadeUp} custom={0} initial="hidden" animate="show"
        className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-violet-400">Users</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">Students</h1>
          <p className="mt-1.5 text-muted-foreground">View, edit, and manage all student accounts.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email, phone..."
              className="pl-9 pr-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 w-64" />
          </div>
          <button onClick={load} disabled={loading}
            className="p-2.5 rounded-xl border border-border bg-card/60 backdrop-blur-sm hover:bg-muted transition-colors text-muted-foreground shadow-sm">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
          </button>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => {
              if (!students?.length) return;
              exportToPdf({
                title: "Students Report",
                subtitle: `All registered students — ${students.length} records`,
                filename: `students-report-${new Date().toISOString().slice(0, 10)}.pdf`,
                columns: [{ header: "#", dataKey: "num" }, { header: "Full Name", dataKey: "fullName" }, { header: "Email", dataKey: "email" }, { header: "Phone", dataKey: "phoneNumber" }, { header: "Joined", dataKey: "joinedAt" }],
                rows: (students || []).map((s, i) => ({ num: i + 1, fullName: s.fullName || "—", email: s.email || "—", phoneNumber: s.phoneNumber || "—", joinedAt: formatDate(s.createdAt) })),
              });
            }}
            disabled={!students?.length || loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card/60 backdrop-blur-sm text-foreground font-medium text-sm hover:bg-muted/60 transition-all disabled:opacity-50 shadow-sm">
            <Download className="w-4 h-4" /> Export PDF
          </motion.button>
        </div>
      </motion.div>

      <motion.div variants={fadeUp} custom={1} initial="hidden" animate="show"
        className="bg-card/60 backdrop-blur-sm rounded-2xl border border-border shadow-lg ring-1 ring-border/50 overflow-hidden">
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-4">
            <div className="relative w-12 h-12"><div className="absolute inset-0 rounded-full border-4 border-violet-500/20" /><div className="absolute inset-0 rounded-full border-4 border-transparent border-t-violet-500 animate-spin" /></div>
            <p className="text-muted-foreground text-sm">Loading students…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <div className="text-foreground font-semibold">{search ? "No students match your search" : "No students yet"}</div>
            <div className="text-muted-foreground text-sm mt-1">{search ? "Try a different search term." : "Students will appear here once they register."}</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-muted/30 text-muted-foreground text-[11px] uppercase tracking-wider border-b border-border/60">
                  {["#", "Name", "Email", "Phone", "Joined", "Actions"].map(h => (
                    <th key={h} className="px-6 py-4 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filtered.map((s, idx) => (
                  <>
                    <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-4 text-sm text-muted-foreground">{idx + 1}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                            {(s.fullName || s.email || "?").charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-semibold text-foreground">{s.fullName || "—"}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 shrink-0" />{s.email}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {s.phoneNumber ? <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 shrink-0" />{s.phoneNumber}</div> : "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{formatDate(s.createdAt)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button onClick={() => setViewOrdersStudent(s)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/15 text-indigo-400 rounded-lg text-xs font-medium hover:bg-indigo-500/25 transition-colors">
                            <ClipboardList className="w-3.5 h-3.5" /> Orders
                          </button>
                          <button onClick={() => startEdit(s)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition-colors">
                            <Edit2 className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button onClick={() => startReset(s.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 text-amber-400 rounded-lg text-xs font-medium hover:bg-amber-500/25 transition-colors">
                            <Key className="w-3.5 h-3.5" /> Reset PW
                          </button>
                        </div>
                      </td>
                    </tr>
                    {editingId === s.id && (
                      <tr key={s.id + "-edit"} className="bg-muted/20">
                        <td colSpan={6} className="px-6 py-5">
                          <div className="max-w-lg">
                            <div className="text-sm font-semibold text-foreground mb-3">Edit Student Profile</div>
                            <div className="grid sm:grid-cols-2 gap-4 mb-4">
                              <div>
                                <label className="text-xs text-muted-foreground block mb-1">Full Name</label>
                                <input value={editName} onChange={e => setEditName(e.target.value)}
                                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground block mb-1">Phone Number</label>
                                <input value={editPhone} onChange={e => setEditPhone(e.target.value)}
                                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={handleSave} disabled={saving}
                                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                Save Changes
                              </button>
                              <button onClick={cancelEdit} className="px-4 py-2 bg-muted text-muted-foreground rounded-xl text-sm font-medium hover:bg-muted/80 transition-colors">Cancel</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    {resetId === s.id && (
                      <tr key={s.id + "-reset"} className="bg-amber-500/5">
                        <td colSpan={6} className="px-6 py-5">
                          <div className="max-w-sm">
                            <div className="text-sm font-semibold text-foreground mb-3">Reset Password for {s.fullName || s.email}</div>
                            <div className="flex gap-3 mb-3">
                              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                                placeholder="New password (min 6 chars)"
                                className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                              <button onClick={handleReset} disabled={resetting || newPassword.length < 6}
                                className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 disabled:opacity-60 transition-colors">
                                {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                                Reset
                              </button>
                            </div>
                            <button onClick={cancelReset} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {students && students.length > 0 && (
          <div className="px-6 py-4 border-t border-border/60 flex items-center justify-between">
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Users className="w-3.5 h-3.5" />
              {filtered.length} of {students.length} students
              {search && <span className="text-primary font-medium">(filtered)</span>}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              {students.length} registered
            </div>
          </div>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
