import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { formatCurrency, formatDate } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import {
  Loader2, Search, RotateCcw, RefreshCw, FileText, User, Mail, Phone, ExternalLink,
  CheckCircle, Clock, XCircle, ChevronDown, ChevronUp, Filter, Download, Sparkles,
  Trash2, Archive, ArchiveRestore, FolderOpen, AlertCircle
} from "lucide-react";
import { exportToPdf } from "@/lib/exportPdf";
import { motion } from "framer-motion";

const API_BASE = "/api";
const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.08, ease: EASE } }),
};

type Order = {
  id: string; orderId: string; studentName: string; studentEmail: string;
  studentPhoneNumber?: string; department: string; courseName: string;
  levelOfStudy: string; serviceType: string; researchTopic: string;
  researchObjectives?: string; additionalInstructions?: string;
  uploadedFileUrl?: string; uploadedFileName?: string;
  status: string; paymentOption?: string; assignedAdminId?: string;
  assignedAdminName?: string; depositAmount: number; totalAmount: number;
  depositPaid: boolean; balancePaid: boolean; revisionCount?: number;
  completedFileUrl?: string; completedFileLink?: string; completedFileStoragePath?: string;
  completedAt?: string; createdAt: string; updatedAt: string;
};

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "pending_payment", label: "Pending Payment" },
  { value: "pending_assignment", label: "Pending Assignment" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "under_review", label: "Under Review" },
  { value: "completed", label: "Completed" },
  { value: "awaiting_balance", label: "Awaiting Balance" },
  { value: "ready_for_download", label: "Ready for Download" },
  { value: "closed", label: "Closed" },
  { value: "refund_requested", label: "Refund Requested" },
  { value: "refunded", label: "Refunded" },
];

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

function Orbs() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
      <div className="absolute -top-32 -right-32 w-[480px] h-[480px] rounded-full bg-indigo-600/8 blur-[100px] animate-pulse" style={{ animationDuration: "7s" }} />
      <div className="absolute bottom-0 -left-20 w-[400px] h-[400px] rounded-full bg-cyan-500/7 blur-[110px] animate-pulse" style={{ animationDuration: "9s", animationDelay: "2s" }} />
      <div className="absolute inset-0 opacity-[0.02]"
        style={{ backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
    </div>
  );
}

type Proposal = {
  id: string; order_id: string; student_name: string; student_email: string;
  uploaded_file_url: string; uploaded_file_name: string; status: string;
  service_type: string; created_at: string;
};

type RecycleBinItem = {
  id: string; order_id: string; order_display_id: string; student_name: string;
  student_email: string; file_path: string; file_name: string;
  service_type: string; order_status: string; deleted_at: string;
};

export default function SuperAdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewTab, setViewTab] = useState<"all" | "unclaimed" | "claimed" | "proposals">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingUrlId, setEditingUrlId] = useState<string | null>(null);
  const [urlForm, setUrlForm] = useState({ fileUrl: "", fileLink: "" });
  const [savingUrl, setSavingUrl] = useState(false);
  const [downloadingProposalId, setDownloadingProposalId] = useState<string | null>(null);
  const [downloadingCompletedId, setDownloadingCompletedId] = useState<string | null>(null);

  // ── Proposals management state ──
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [recycleBin, setRecycleBin] = useState<RecycleBinItem[]>([]);
  const [loadingProposals, setLoadingProposals] = useState(false);
  const [proposalFilter, setProposalFilter] = useState("all");
  const [deletingProposalId, setDeletingProposalId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [hardDeletingId, setHardDeletingId] = useState<string | null>(null);
  const [recycleBinOpen, setRecycleBinOpen] = useState(false);

  const handleDownloadProposal = async (orderId: string) => {
    setDownloadingProposalId(orderId);
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/orders/${orderId}/proposal-download-url`, { headers: auth });
      if (!res.ok) throw new Error("Failed to get download URL");
      const { signedUrl, filename } = await res.json();
      const a = document.createElement("a");
      a.href = signedUrl;
      a.download = filename || "proposal";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      alert("Could not get proposal download link. The file may not be available.");
    } finally {
      setDownloadingProposalId(null);
    }
  };

  const handleDownloadCompleted = async (orderId: string) => {
    setDownloadingCompletedId(orderId);
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/orders/${orderId}/completed-download-url`, { headers: auth });
      if (!res.ok) throw new Error("Failed to get download URL");
      const { signedUrl, filename } = await res.json();
      const a = document.createElement("a");
      a.href = signedUrl;
      a.download = filename || "completed-work";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      alert("Could not get completed file download link. The file may not be available.");
    } finally {
      setDownloadingCompletedId(null);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const auth = await getAuthHeaders();
      const params = new URLSearchParams({ limit: "200" });
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`${API_BASE}/superadmin/orders?${params}`, { headers: auth });
      if (!res.ok) throw new Error("Failed to load orders");
      setOrders(await res.json());
    } catch { setOrders([]); }
    finally { setLoading(false); }
  };

  const loadProposals = async () => {
    setLoadingProposals(true);
    try {
      const auth = await getAuthHeaders();
      const [pRes, rRes] = await Promise.all([
        fetch(`${API_BASE}/superadmin/proposals`, { headers: auth }),
        fetch(`${API_BASE}/superadmin/proposals/recycle-bin`, { headers: auth }),
      ]);
      setProposals(pRes.ok ? await pRes.json() : []);
      setRecycleBin(rRes.ok ? await rRes.json() : []);
    } catch { setProposals([]); setRecycleBin([]); }
    finally { setLoadingProposals(false); }
  };

  const handleSoftDelete = async (orderId: string) => {
    if (!confirm("Move this proposal to the recycle bin?")) return;
    setDeletingProposalId(orderId);
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/superadmin/proposals/${orderId}/soft-delete`, { method: "POST", headers: auth });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      await loadProposals();
    } catch (e) { alert(`Failed: ${e instanceof Error ? e.message : "Unknown error"}`); }
    finally { setDeletingProposalId(null); }
  };

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/superadmin/proposals/recycle-bin/${id}/restore`, { method: "POST", headers: auth });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      await loadProposals();
    } catch (e) { alert(`Failed to restore: ${e instanceof Error ? e.message : "Unknown error"}`); }
    finally { setRestoringId(null); }
  };

  const handleHardDelete = async (id: string) => {
    if (!confirm("Permanently delete this file from storage? This cannot be undone.")) return;
    setHardDeletingId(id);
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/superadmin/proposals/recycle-bin/${id}`, { method: "DELETE", headers: auth });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      await loadProposals();
    } catch (e) { alert(`Failed to delete: ${e instanceof Error ? e.message : "Unknown error"}`); }
    finally { setHardDeletingId(null); }
  };

  useEffect(() => { load(); }, [statusFilter]);
  useEffect(() => { if (viewTab === "proposals") loadProposals(); }, [viewTab]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); load(); };

  const handleSaveUrl = async (orderId: string) => {
    setSavingUrl(true);
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/superadmin/orders/${orderId}/url`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ fileUrl: urlForm.fileUrl, fileLink: urlForm.fileLink }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      const updated = await res.json();
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updated } : o));
      setEditingUrlId(null);
    } catch {}
    finally { setSavingUrl(false); }
  };

  const formatStatus = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());

  const unclaimedOrders = orders.filter(o => o.status === "pending_assignment");
  const claimedOrders = orders.filter(o => o.status !== "pending_assignment" && !!o.assignedAdminId);
  const displayedOrders = viewTab === "unclaimed" ? unclaimedOrders : viewTab === "claimed" ? claimedOrders : orders;

  return (
    <DashboardLayout>
      <Orbs />

      <motion.div variants={fadeUp} custom={0} initial="hidden" animate="show"
        className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-indigo-400">Management</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">Orders Management</h1>
          <p className="mt-1.5 text-muted-foreground">View and manage all platform orders in full detail.</p>
        </div>
        <div className="flex items-center gap-3">
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => {
              if (!displayedOrders.length) return;
              exportToPdf({
                title: "Orders Management Report",
                subtitle: `${viewTab === "all" ? "All" : viewTab === "unclaimed" ? "Unclaimed" : "Claimed"} orders — ${displayedOrders.length} records`,
                filename: `orders-${viewTab}-${new Date().toISOString().slice(0, 10)}.pdf`,
                columns: [
                  { header: "Order ID", dataKey: "orderId" }, { header: "Student", dataKey: "studentName" },
                  { header: "Email", dataKey: "studentEmail" }, { header: "Level", dataKey: "levelOfStudy" },
                  { header: "Service", dataKey: "serviceType" }, { header: "Topic", dataKey: "researchTopic" },
                  { header: "Status", dataKey: "status" }, { header: "Researcher", dataKey: "assignedAdminName" },
                  { header: "Total", dataKey: "totalAmount" }, { header: "Deposit", dataKey: "depositAmount" },
                  { header: "Dep. Paid", dataKey: "depositPaid" }, { header: "Bal. Paid", dataKey: "balancePaid" },
                  { header: "Created", dataKey: "createdAt" },
                ],
                rows: displayedOrders.map(o => ({
                  orderId: o.orderId || "—", studentName: o.studentName || "—",
                  studentEmail: o.studentEmail || "—", levelOfStudy: o.levelOfStudy || "—",
                  serviceType: o.serviceType || "—",
                  researchTopic: o.researchTopic?.length > 60 ? o.researchTopic.slice(0, 57) + "..." : (o.researchTopic || "—"),
                  status: o.status.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
                  assignedAdminName: o.assignedAdminName || "Unassigned",
                  totalAmount: formatCurrency(o.totalAmount), depositAmount: formatCurrency(o.depositAmount),
                  depositPaid: o.depositPaid ? "Yes" : "No", balancePaid: o.balancePaid ? "Yes" : "No",
                  createdAt: formatDate(o.createdAt),
                })),
              });
            }}
            disabled={!displayedOrders.length || loading}
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
      <motion.div variants={fadeUp} custom={1} initial="hidden" animate="show" className="flex flex-wrap gap-2 mb-6">
        {[
          { key: "all", label: "All Orders", count: orders.length },
          { key: "unclaimed", label: "Unclaimed", count: unclaimedOrders.length },
          { key: "claimed", label: "Claimed", count: claimedOrders.length },
        ].map(tab => (
          <button key={tab.key} onClick={() => setViewTab(tab.key as "all" | "unclaimed" | "claimed")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${viewTab === tab.key ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "bg-card/60 backdrop-blur-sm border border-border text-muted-foreground hover:bg-muted/60"}`}>
            {tab.label}
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${viewTab === tab.key ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {tab.count}
            </span>
          </button>
        ))}
        <button onClick={() => setViewTab("proposals")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${viewTab === "proposals" ? "bg-sky-600 text-white shadow-md shadow-sky-500/25" : "bg-card/60 backdrop-blur-sm border border-border text-muted-foreground hover:bg-muted/60"}`}>
          <FolderOpen className="w-4 h-4" /> Proposals Library
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${viewTab === "proposals" ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"}`}>
            {proposals.length}
          </span>
        </button>
      </motion.div>

      {/* ── Proposals Management Tab ── */}
      {viewTab === "proposals" && (
        <motion.div variants={fadeUp} custom={2} initial="hidden" animate="show" className="space-y-6">
          {/* Filter + Refresh bar */}
          <div className="bg-card/60 backdrop-blur-sm border border-border rounded-2xl shadow-lg ring-1 ring-border/50 p-4 flex flex-wrap items-center gap-3">
            <FolderOpen className="w-4 h-4 text-sky-400 shrink-0" />
            <span className="text-sm font-semibold text-foreground">Filter by order status:</span>
            {[
              { value: "all", label: "All" },
              { value: "pending_payment", label: "Unpaid" },
              { value: "pending_assignment", label: "Pending" },
              { value: "assigned", label: "Assigned" },
              { value: "in_progress", label: "In Progress" },
              { value: "completed", label: "Completed" },
              { value: "ready_for_download", label: "Ready" },
              { value: "closed", label: "Closed" },
            ].map(f => (
              <button key={f.value} onClick={() => setProposalFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${proposalFilter === f.value ? "bg-sky-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                {f.label}
              </button>
            ))}
            <button onClick={loadProposals} disabled={loadingProposals} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 text-xs font-medium transition-colors">
              {loadingProposals ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Refresh
            </button>
          </div>

          {/* Proposals grid */}
          {loadingProposals ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="relative w-10 h-10">
                <div className="absolute inset-0 rounded-full border-4 border-sky-500/20" />
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-sky-500 animate-spin" />
              </div>
              <p className="text-muted-foreground text-sm">Loading proposals…</p>
            </div>
          ) : (() => {
            const filtered = proposalFilter === "all" ? proposals : proposals.filter(p => p.status === proposalFilter);
            if (filtered.length === 0) return (
              <div className="bg-card/60 backdrop-blur-sm border border-border rounded-2xl p-12 text-center">
                <FolderOpen className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-foreground font-semibold">No proposals found</p>
                <p className="text-muted-foreground text-sm mt-1">
                  {proposalFilter === "all" ? "No students have uploaded proposals yet." : `No proposals with status "${proposalFilter}".`}
                </p>
              </div>
            );
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map(p => {
                  const statusColors: Record<string, string> = {
                    pending_payment: "bg-amber-500/15 text-amber-400",
                    pending_assignment: "bg-orange-500/15 text-orange-400",
                    assigned: "bg-blue-500/15 text-blue-400",
                    in_progress: "bg-indigo-500/15 text-indigo-400",
                    completed: "bg-emerald-500/15 text-emerald-400",
                    ready_for_download: "bg-green-500/15 text-green-400",
                    closed: "bg-muted text-muted-foreground",
                  };
                  const isDeleting = deletingProposalId === p.id;
                  const isDownloading = downloadingProposalId === p.id;
                  return (
                    <div key={p.id} className="bg-card/70 backdrop-blur-sm border border-border rounded-2xl shadow-sm ring-1 ring-border/50 p-4 flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-mono text-xs font-bold text-primary">{p.order_id}</span>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${statusColors[p.status] || "bg-muted text-muted-foreground"}`}>
                              {p.status.replace(/_/g, " ")}
                            </span>
                            <span className="text-[10px] text-muted-foreground">{p.service_type}</span>
                          </div>
                        </div>
                        <FileText className="w-8 h-8 text-sky-400/50 shrink-0 mt-0.5" />
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <User className="w-3 h-3" /> {p.student_name || "—"}
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Mail className="w-3 h-3" /> {p.student_email || "—"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 p-2.5 bg-sky-500/8 border border-sky-500/20 rounded-xl">
                        <FileText className="w-4 h-4 text-sky-400 shrink-0" />
                        <span className="text-xs text-sky-400 font-medium truncate flex-1">{p.uploaded_file_name || "proposal"}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">Uploaded {formatDate(p.created_at)}</div>
                      <div className="flex gap-2 mt-auto">
                        <button onClick={() => handleDownloadProposal(p.id)} disabled={isDownloading}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-sky-500/10 border border-sky-500/25 text-sky-400 text-xs font-semibold hover:bg-sky-500/20 transition-colors disabled:opacity-60">
                          {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Download
                        </button>
                        <button onClick={() => handleSoftDelete(p.id)} disabled={isDeleting}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-60">
                          {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Recycle Bin */}
          <div className="bg-card/60 backdrop-blur-sm border border-red-500/20 rounded-2xl shadow-sm ring-1 ring-red-500/10 overflow-hidden">
            <button onClick={() => setRecycleBinOpen(o => !o)}
              className="w-full flex items-center justify-between p-4 hover:bg-muted/20 transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center">
                  <Archive className="w-4 h-4 text-red-400" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold text-foreground">Recycle Bin</div>
                  <div className="text-xs text-muted-foreground">{recycleBin.length} item{recycleBin.length !== 1 ? "s" : ""} — second deletion permanently removes from storage</div>
                </div>
              </div>
              {recycleBinOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
            {recycleBinOpen && (
              <div className="border-t border-red-500/15 p-4">
                {recycleBin.length === 0 ? (
                  <div className="text-center py-8">
                    <Archive className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">Recycle bin is empty</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 p-3 bg-amber-500/8 border border-amber-500/20 rounded-xl">
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                      <p className="text-xs text-amber-400">Items here can be restored or permanently deleted. Permanent deletion removes the file from storage and cannot be undone.</p>
                    </div>
                    {recycleBin.map(item => {
                      const isRestoring = restoringId === item.id;
                      const isHardDeleting = hardDeletingId === item.id;
                      return (
                        <div key={item.id} className="flex items-center gap-3 p-3 bg-muted/20 border border-border/50 rounded-xl">
                          <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                            <FileText className="w-4 h-4 text-red-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-bold text-muted-foreground">{item.order_display_id}</span>
                              <span className="text-[10px] text-muted-foreground">({item.order_status?.replace(/_/g, " ")})</span>
                            </div>
                            <p className="text-xs font-medium text-foreground truncate">{item.file_name || "proposal"}</p>
                            <p className="text-[10px] text-muted-foreground">{item.student_name} · Deleted {formatDate(item.deleted_at)}</p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button onClick={() => handleRestore(item.id)} disabled={isRestoring || isHardDeleting}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition-colors disabled:opacity-60">
                              {isRestoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArchiveRestore className="w-3 h-3" />} Restore
                            </button>
                            <button onClick={() => handleHardDelete(item.id)} disabled={isRestoring || isHardDeleting}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-60">
                              {isHardDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Delete Forever
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Filters — only shown when not on proposals tab */}
      {viewTab !== "proposals" && <>
      {/* Filters */}
      <motion.div variants={fadeUp} custom={2} initial="hidden" animate="show"
        className="bg-card/60 backdrop-blur-sm border border-border rounded-2xl shadow-lg ring-1 ring-border/50 p-5 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by order ID, student name, email, topic..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
            <button type="submit" className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors shadow-md shadow-primary/25">
              Search
            </button>
          </form>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        {displayedOrders.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">Showing {displayedOrders.length} order{displayedOrders.length !== 1 ? "s" : ""}</p>
        )}
      </motion.div>

      {/* Orders List */}
      <motion.div variants={fadeUp} custom={3} initial="hidden" animate="show">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-indigo-500 animate-spin" />
            </div>
            <p className="text-muted-foreground text-sm">Loading orders…</p>
          </div>
        ) : displayedOrders.length === 0 ? (
          <div className="bg-card/60 backdrop-blur-sm border border-border rounded-2xl shadow-lg p-16 text-center">
            <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
            <div className="text-foreground font-semibold">No orders found</div>
            <div className="text-muted-foreground text-sm mt-1">
              {viewTab === "unclaimed" ? "No unclaimed orders." : viewTab === "claimed" ? "No claimed orders." : "Try adjusting your filters."}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {displayedOrders.map(order => {
              const isExpanded = expandedId === order.id;
              const isEditingUrl = editingUrlId === order.id;
              return (
                <div key={order.id}
                  className={`bg-card/60 backdrop-blur-sm border rounded-2xl shadow-sm ring-1 overflow-hidden transition-all ${isExpanded ? "border-primary/30 ring-primary/20" : "border-border ring-border/50"}`}>
                  <div className="p-5 flex flex-col sm:flex-row sm:items-center gap-3 cursor-pointer hover:bg-muted/20 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : order.id)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap mb-1">
                        <span className="font-mono text-sm font-bold text-primary">{order.orderId}</span>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${STATUS_COLOR[order.status] || "bg-muted text-muted-foreground"}`}>
                          {formatStatus(order.status)}
                        </span>
                        <span className="text-xs bg-muted/60 text-muted-foreground px-2 py-0.5 rounded-full">{order.serviceType}</span>
                      </div>
                      <div className="text-sm font-semibold text-foreground truncate">{order.researchTopic}</div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1"><User className="w-3 h-3" />{order.studentName || "—"}</span>
                        <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{order.studentEmail || "—"}</span>
                        {order.studentPhoneNumber && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{order.studentPhoneNumber}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Total</div>
                        <div className="font-bold text-foreground">{formatCurrency(order.totalAmount)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Date</div>
                        <div className="text-xs text-foreground">{formatDate(order.createdAt)}</div>
                      </div>
                      {isExpanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border/60 bg-muted/10 p-5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-5">
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Student Info</div>
                          <div className="space-y-1 text-sm">
                            <div className="text-foreground font-medium">{order.studentName}</div>
                            <div className="text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{order.studentEmail}</div>
                            {order.studentPhoneNumber && <div className="text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{order.studentPhoneNumber}</div>}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Order Info</div>
                          <div className="space-y-1 text-sm">
                            <div><span className="text-muted-foreground">Level:</span> <span className="text-foreground">{order.levelOfStudy}</span></div>
                            <div><span className="text-muted-foreground">Department:</span> <span className="text-foreground">{order.department}</span></div>
                            <div><span className="text-muted-foreground">Course:</span> <span className="text-foreground">{order.courseName}</span></div>
                            <div><span className="text-muted-foreground">Payment:</span> <span className="text-foreground capitalize">{order.paymentOption || "deposit"}</span></div>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Payment Status</div>
                          <div className="space-y-1 text-sm">
                            <div className="flex items-center gap-2">
                              {order.depositPaid ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                              <span className="text-foreground">Deposit {formatCurrency(order.depositAmount)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {order.balancePaid ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Clock className="w-4 h-4 text-muted-foreground" />}
                              <span className="text-foreground">Balance {formatCurrency(order.totalAmount - order.depositAmount)}</span>
                            </div>
                            {order.assignedAdminName && (
                              <div className="text-muted-foreground">Researcher: <span className="text-foreground">{order.assignedAdminName}</span></div>
                            )}
                            {typeof order.revisionCount === "number" && (
                              <div className={`flex items-center gap-1.5 text-sm font-semibold ${order.revisionCount > 0 ? "text-amber-400" : "text-muted-foreground"}`}>
                                <RefreshCw className="w-4 h-4" />
                                {order.revisionCount} Revision{order.revisionCount !== 1 ? "s" : ""}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {order.uploadedFileUrl && (
                        <div className="mb-4">
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Uploaded Proposal</div>
                          <button
                            onClick={() => handleDownloadProposal(order.id)}
                            disabled={downloadingProposalId === order.id}
                            className="flex items-center gap-2 px-4 py-2.5 bg-sky-500/10 border border-sky-500/30 text-sky-400 rounded-xl text-sm font-semibold hover:bg-sky-500/20 transition-colors disabled:opacity-60">
                            {downloadingProposalId === order.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Download className="w-4 h-4" />}
                            {order.uploadedFileName ? `Download: ${order.uploadedFileName}` : "Download Proposal"}
                          </button>
                        </div>
                      )}
                      {order.researchObjectives && (
                        <div className="mb-4">
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Research Objectives</div>
                          {(() => {
                            const raw = order.researchObjectives || "";
                            const refMatch = raw.match(/^Referenced Proposal Order:\s*(\S+)/);
                            if (refMatch) {
                              const refId = refMatch[1];
                              const rest = raw.replace(/^Referenced Proposal Order:\s*\S+\n?/, "").trim();
                              return (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                                    <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                    <div>
                                      <div className="text-[9px] font-bold text-amber-400 uppercase tracking-wider">Referenced Proposal Order</div>
                                      <div className="font-mono text-sm font-bold text-amber-300">{refId}</div>
                                    </div>
                                  </div>
                                  {rest && <p className="text-sm text-foreground leading-relaxed">{rest}</p>}
                                </div>
                              );
                            }
                            return <p className="text-sm text-foreground leading-relaxed">{raw}</p>;
                          })()}
                        </div>
                      )}
                      {order.additionalInstructions && (
                        <div className="mb-4">
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Additional Instructions</div>
                          <p className="text-sm text-foreground leading-relaxed">{order.additionalInstructions}</p>
                        </div>
                      )}

                      {order.completedFileStoragePath && (
                        <div className="mb-4">
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Completed Work File</div>
                          <button
                            onClick={() => handleDownloadCompleted(order.id)}
                            disabled={downloadingCompletedId === order.id}
                            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl text-sm font-semibold hover:bg-emerald-500/20 transition-colors disabled:opacity-60">
                            {downloadingCompletedId === order.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Download className="w-4 h-4" />}
                            {order.completedFileStoragePath.split("/").pop() || "Download Completed File"}
                          </button>
                        </div>
                      )}

                      <div className="border-t border-border/60 pt-4 mt-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Document URL</div>
                          <button
                            onClick={() => { setEditingUrlId(isEditingUrl ? null : order.id); setUrlForm({ fileUrl: order.completedFileUrl || "", fileLink: order.completedFileLink || "" }); }}
                            className="text-xs px-3 py-1.5 bg-primary/10 text-primary rounded-lg font-medium hover:bg-primary/20 transition-colors">
                            {isEditingUrl ? "Cancel" : "Edit URL"}
                          </button>
                        </div>
                        {(order.completedFileUrl || order.completedFileLink) && !isEditingUrl && (
                          <a href={order.completedFileUrl || order.completedFileLink} download rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-sm text-emerald-400 font-medium hover:bg-emerald-500/20 transition-colors">
                            <Download className="w-4 h-4" /> Download Document
                          </a>
                        )}
                        {!order.completedFileUrl && !order.completedFileLink && !isEditingUrl && (
                          <p className="text-sm text-muted-foreground">No document uploaded yet.</p>
                        )}
                        {isEditingUrl && (
                          <div className="space-y-3">
                            {[{ label: "Google Drive / Direct URL", field: "fileUrl", placeholder: "https://drive.google.com/..." },
                              { label: "Or File Link", field: "fileLink", placeholder: "https://..." }].map(({ label, field, placeholder }) => (
                              <div key={field}>
                                <label className="block text-xs text-muted-foreground mb-1">{label}</label>
                                <input value={urlForm[field as keyof typeof urlForm]}
                                  onChange={e => setUrlForm(f => ({ ...f, [field]: e.target.value }))}
                                  placeholder={placeholder}
                                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                              </div>
                            ))}
                            <button onClick={() => handleSaveUrl(order.id)} disabled={savingUrl}
                              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
                              {savingUrl ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                              Save URL
                            </button>
                          </div>
                        )}
                      </div>
                      {order.completedAt && (
                        <div className="mt-3 text-xs text-muted-foreground">Completed: {formatDate(order.completedAt)}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
      </>}
    </DashboardLayout>
  );
}
