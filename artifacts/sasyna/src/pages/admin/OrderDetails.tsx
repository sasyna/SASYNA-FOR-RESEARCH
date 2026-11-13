import { useState, useEffect, useRef } from "react";
import { useRoute, Link } from "wouter";
import { useGetOrder, useUpdateOrderStatus, useCompleteOrder, useUpdateOrderFileUrl } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDate, formatCurrency } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, Upload, Save, Check, ArrowLeft, User, BookOpen,
  Clock, ExternalLink, Sparkles, GraduationCap, CheckCircle2, AlertTriangle, Pencil, X,
  Download, FileText, CloudUpload, Link2, Trash2, TriangleAlert, RefreshCw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

const STATUS_OPTIONS = [
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "under_review", label: "Under Review" },
];

function Orbs() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
      <div className="absolute -top-24 -right-24 w-[400px] h-[400px] rounded-full bg-blue-600/8 blur-[90px] animate-pulse" style={{ animationDuration: "7s" }} />
      <div className="absolute bottom-0 left-0 w-[380px] h-[380px] rounded-full bg-violet-500/6 blur-[100px] animate-pulse" style={{ animationDuration: "9s", animationDelay: "2s" }} />
    </div>
  );
}

function SectionCard({ icon: Icon, title, children, accent }: {
  icon: React.ElementType; title: string; children: React.ReactNode; accent?: "blue" | "emerald" | "amber" | "violet";
}) {
  const accentMap = {
    blue: "text-blue-400 bg-blue-500/10",
    emerald: "text-emerald-400 bg-emerald-500/10",
    amber: "text-amber-400 bg-amber-500/10",
    violet: "text-violet-400 bg-violet-500/10",
  };
  const accentClass = accentMap[accent || "blue"];
  return (
    <div className="bg-card/70 backdrop-blur-sm border border-border rounded-2xl shadow-sm ring-1 ring-border/50 overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border/50 bg-gradient-to-r from-muted/30 to-transparent">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accentClass}`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-sm font-bold text-foreground">{title}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

export default function AdminOrderDetails() {
  const [, params] = useRoute("/admin/orders/:id");
  const orderId = params?.id || "";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: order, isLoading } = useGetOrder(orderId, { query: { queryKey: ['/api/orders', orderId], enabled: !!orderId } });
  const { mutate: updateStatus, isPending: isUpdatingStatus } = useUpdateOrderStatus();
  const { mutate: completeOrder, isPending: isCompleting } = useCompleteOrder();
  const { mutate: updateFileUrl, isPending: isUpdatingUrl } = useUpdateOrderFileUrl();

  const [status, setStatus] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [fileLink, setFileLink] = useState("");
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [editFileUrl, setEditFileUrl] = useState("");
  const [editFileLink, setEditFileLink] = useState("");
  const [downloadingProposal, setDownloadingProposal] = useState(false);
  const [submitMode, setSubmitMode] = useState<"upload" | "url">("upload");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingFile, setDeletingFile] = useState(false);
  const [downloadingCompleted, setDownloadingCompleted] = useState(false);

  const handleDownloadCompleted = async () => {
    if (!order) return;
    setDownloadingCompleted(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/orders/${order.id}/completed-download-url`, { headers });
      if (!res.ok) throw new Error("Failed to get download URL");
      const { signedUrl, filename } = await res.json();
      const a = document.createElement("a");
      a.href = signedUrl;
      a.download = filename || "completed-work";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      toast({ title: "Download failed", description: "Could not get download link for the completed file.", variant: "destructive" });
    } finally {
      setDownloadingCompleted(false);
    }
  };

  const handleFileUpload = async () => {
    if (!uploadFile || !order) return;
    setUploading(true);
    setUploadProgress(10);
    try {
      const headers = await getAuthHeaders();
      const urlRes = await fetch(`/api/orders/${order.id}/completed-upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ filename: uploadFile.name }),
      });
      if (!urlRes.ok) {
        const e = await urlRes.json();
        toast({ title: "Upload failed", description: e.error || "Could not get upload URL.", variant: "destructive" });
        return;
      }
      const { signedUrl, path } = await urlRes.json();
      setUploadProgress(30);

      const uploadRes = await fetch(signedUrl, {
        method: "PUT",
        body: uploadFile,
        headers: { "Content-Type": uploadFile.type || "application/octet-stream" },
      });
      if (!uploadRes.ok) {
        toast({ title: "Upload failed", description: "File could not be uploaded to storage.", variant: "destructive" });
        return;
      }
      setUploadProgress(80);

      const saveRes = await fetch(`/api/orders/${order.id}/completed-file`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ storagePath: path }),
      });
      if (!saveRes.ok) {
        const e = await saveRes.json();
        toast({ title: "Save failed", description: e.error || "Could not save file path.", variant: "destructive" });
        return;
      }
      setUploadProgress(100);
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast({ title: "Work submitted!", description: "File uploaded and order marked ready for download." });
    } catch {
      toast({ title: "Upload failed", description: "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  useEffect(() => {
    if (order?.status) setStatus(order.status);
  }, [order?.status]);

  if (isLoading) return (
    <DashboardLayout>
      <Orbs />
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-4 border-blue-500/20" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-500 animate-spin" />
        </div>
        <p className="text-muted-foreground text-sm">Loading order details…</p>
      </div>
    </DashboardLayout>
  );

  if (!order) return (
    <DashboardLayout>
      <div className="p-10 text-center text-muted-foreground">Order not found</div>
    </DashboardLayout>
  );

  const handleStatusChange = () => {
    if (!status || status === order.status) return;
    updateStatus({ orderId: order.id, data: { status } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId] });
        queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
        toast({ title: "Status updated", description: `Order is now ${status.replace(/_/g, " ")}` });
      }
    });
  };

  const handleComplete = () => {
    if (!fileUrl && !fileLink) {
      toast({ title: "File required", description: "Please provide a file URL or Google Drive link", variant: "destructive" });
      return;
    }
    completeOrder({ orderId: order.id, data: { fileUrl: fileUrl || fileLink, fileLink: fileLink || fileUrl } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId] });
        queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
        toast({ title: "Work submitted!", description: "Order marked as completed. Student will be notified." });
      }
    });
  };

  const handleSaveUrl = () => {
    if (!editFileUrl && !editFileLink) {
      toast({ title: "File required", description: "Please provide a file URL or Google Drive link", variant: "destructive" });
      return;
    }
    updateFileUrl({ orderId: order.id, data: { fileUrl: editFileUrl || editFileLink, fileLink: editFileLink || editFileUrl } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId] });
        queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
        setIsEditingUrl(false);
        toast({ title: "URL updated!", description: "The document link has been updated successfully." });
      },
      onError: () => {
        toast({ title: "Update failed", description: "Could not update the document URL. Please try again.", variant: "destructive" });
      }
    });
  };

  const handleStartEditUrl = () => {
    setEditFileLink(order.completedFileLink || "");
    setEditFileUrl(order.completedFileUrl || "");
    setIsEditingUrl(true);
  };

  const handleDeleteFile = async () => {
    if (!order) return;
    setDeletingFile(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/orders/${order.id}/completed-file`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "Delete failed", description: err.error || "Could not delete the file.", variant: "destructive" });
        return;
      }
      setShowDeleteDialog(false);
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      toast({ title: "File deleted", description: "The uploaded file has been removed from storage. You can now re-upload." });
    } catch {
      toast({ title: "Delete failed", description: "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setDeletingFile(false);
    }
  };

  const handleDownloadProposal = async () => {
    setDownloadingProposal(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/orders/${order.id}/proposal-download-url`, { headers });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "Download failed", description: err.error || "Could not generate download link.", variant: "destructive" });
        return;
      }
      const { signedUrl, filename } = await res.json();
      const a = document.createElement("a");
      a.href = signedUrl;
      a.download = filename || "proposal.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      toast({ title: "Download failed", description: "An error occurred while downloading the proposal.", variant: "destructive" });
    } finally {
      setDownloadingProposal(false);
    }
  };

  const orderAny = order as unknown as Record<string, unknown>;
  const storagePath = orderAny.completedFileStoragePath as string | undefined;
  const isOrderDone = ["completed", "ready_for_download", "awaiting_balance"].includes(order.status || "");
  const hasStorageFile = !!storagePath && isOrderDone;
  const canSubmit = !isOrderDone && !storagePath;
  const alreadySubmittedUrl = (order.completedFileUrl || order.completedFileLink) && isOrderDone;
  const canUpdateStatus = !["completed", "ready_for_download", "awaiting_balance"].includes(order.status || "");
  const hasProposal = !!(orderAny.uploadedFileUrl);

  return (
    <DashboardLayout>
      <Orbs />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="mb-6">
        <Link href="/admin/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" /> Back to Workspace
        </Link>
        <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/70 backdrop-blur-sm shadow-xl ring-1 ring-border/50 p-5 sm:p-6">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/8 via-transparent to-violet-500/5 pointer-events-none" />
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-blue-400">Research Order</span>
              </div>
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <h1 className="text-2xl font-extrabold text-foreground font-mono">{order.orderId}</h1>
                <StatusBadge status={order.status || ""} />
              </div>
              <p className="text-sm text-muted-foreground">Received {formatDate(order.createdAt)}</p>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <div className="text-xs font-bold text-emerald-400">Deposit Confirmed</div>
                <div className="text-[11px] text-muted-foreground">Order is active</div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1, ease: EASE }}
        className="grid md:grid-cols-3 gap-5">

        {/* Left: Research Details */}
        <div className="md:col-span-2 space-y-5">
          <SectionCard icon={BookOpen} title="Research Requirements" accent="blue">
            <div className="space-y-5">
              <div>
                <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Research Topic</div>
                <div className="text-base font-semibold text-foreground bg-muted/30 p-3.5 rounded-xl">{order.researchTopic}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Objectives</div>
                {(() => {
                  const raw = order.researchObjectives || "";
                  const refMatch = raw.match(/^Referenced Proposal Order:\s*(\S+)/);
                  if (refMatch) {
                    const refId = refMatch[1];
                    const rest = raw.replace(/^Referenced Proposal Order:\s*\S+\n?/, "").trim();
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                          <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                            <FileText className="w-3.5 h-3.5 text-amber-400" />
                          </div>
                          <div>
                            <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Referenced Proposal Order</div>
                            <div className="font-mono text-sm font-bold text-amber-300">{refId}</div>
                          </div>
                        </div>
                        {rest && <div className="text-foreground whitespace-pre-wrap bg-muted/30 p-4 rounded-xl text-sm leading-relaxed">{rest}</div>}
                      </div>
                    );
                  }
                  return <div className="text-foreground whitespace-pre-wrap bg-muted/30 p-4 rounded-xl text-sm leading-relaxed">{raw}</div>;
                })()}
              </div>
              {order.additionalInstructions && (
                <div>
                  <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Additional Instructions</div>
                  <div className="text-foreground whitespace-pre-wrap bg-amber-500/8 border border-amber-500/20 p-4 rounded-xl text-sm leading-relaxed">{order.additionalInstructions}</div>
                </div>
              )}

              {/* Approved Proposal Download — for Research Dissertation */}
              {hasProposal && (
                <div>
                  <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Approved Proposal</div>
                  <div className="flex items-center gap-3 p-3.5 bg-sky-500/8 border border-sky-500/25 rounded-xl">
                    <div className="w-9 h-9 rounded-xl bg-sky-500/20 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-sky-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-sky-400">
                        {(order as unknown as Record<string, unknown>).uploadedFileName as string || "Approved Proposal"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Uploaded by student. Download to view — do not stream from storage to save bandwidth.
                      </p>
                    </div>
                    <button
                      onClick={handleDownloadProposal}
                      disabled={downloadingProposal}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 text-sm font-semibold hover:bg-sky-500/25 transition-colors disabled:opacity-60 shrink-0"
                    >
                      {downloadingProposal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      Download Proposal
                    </button>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard icon={GraduationCap} title="Academic Info" accent="violet">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { label: "Department", value: order.department },
                { label: "Course", value: order.courseName },
                { label: "Level", value: order.levelOfStudy },
                { label: "Service", value: order.serviceType },
              ].map(({ label, value }) => (
                <div key={label} className="bg-muted/30 rounded-xl p-3">
                  <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">{label}</div>
                  <div className="font-semibold text-foreground">{value}</div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        {/* Right: Admin Controls */}
        <div className="space-y-5">
          <SectionCard icon={Clock} title="Update Status" accent="blue">
            <div className="space-y-3">
              {isOrderDone ? (
                <div className="w-full p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-sm font-semibold text-emerald-400 flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" />
                  {order.status === "ready_for_download" ? "Ready for Download" : "Completed"}
                </div>
              ) : order.status === "awaiting_balance" ? (
                <div className="w-full p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-sm font-semibold text-cyan-400 flex items-center gap-2">
                  <Clock className="w-4 h-4 shrink-0" />
                  Awaiting Balance Payment
                </div>
              ) : (
                <select className="w-full p-3 rounded-xl bg-background border-2 border-border outline-none focus:border-primary transition-colors text-sm font-medium"
                  value={status} onChange={e => setStatus(e.target.value)}>
                  {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              )}
              {canUpdateStatus && (
                <button onClick={handleStatusChange} disabled={isUpdatingStatus || status === order.status}
                  className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 shadow-sm shadow-primary/20">
                  {isUpdatingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Status
                </button>
              )}
              {order.status === "awaiting_balance" && (
                <div className="w-full p-3 bg-cyan-500/8 border border-cyan-500/20 rounded-xl text-xs text-cyan-400/90 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  Status will update automatically once the student pays the balance.
                </div>
              )}
              {!isOrderDone && !["awaiting_balance"].includes(order.status || "") && (
                <p className="text-xs text-muted-foreground text-center">
                  To mark as Completed, use <span className="font-semibold text-primary">Submit Completed Work</span> below
                </p>
              )}
            </div>
          </SectionCard>

          {canSubmit && order.status !== "awaiting_balance" && (
            <div className="bg-primary/5 border border-primary/20 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-4 border-b border-primary/20 bg-primary/5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/20">
                  <Upload className="w-4 h-4 text-primary" />
                </div>
                <span className="text-sm font-bold text-primary">Submit Completed Work</span>
              </div>
              {/* Mode tabs */}
              <div className="flex border-b border-primary/10">
                {([["upload", CloudUpload, "Upload File"], ["url", Link2, "Enter URL"]] as const).map(([mode, Icon, label]) => (
                  <button key={mode} onClick={() => setSubmitMode(mode)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-all ${submitMode === mode ? "bg-primary/10 text-primary border-b-2 border-primary" : "text-muted-foreground hover:bg-primary/5"}`}>
                    <Icon className="w-4 h-4" />{label}
                  </button>
                ))}
              </div>
              <div className="p-5 space-y-4">
                {submitMode === "upload" ? (
                  <>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${uploadFile ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/40 hover:bg-primary/3"}`}>
                      <input ref={fileInputRef} type="file" className="hidden"
                        accept=".pdf,.doc,.docx,.zip"
                        onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                      <CloudUpload className={`w-8 h-8 mx-auto mb-2 ${uploadFile ? "text-primary" : "text-muted-foreground"}`} />
                      {uploadFile ? (
                        <div>
                          <p className="text-sm font-semibold text-primary truncate">{uploadFile.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">{(uploadFile.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm font-semibold text-foreground">Click to choose file</p>
                          <p className="text-xs text-muted-foreground mt-1">PDF, DOC, DOCX, ZIP — max 50 MB</p>
                        </div>
                      )}
                    </div>
                    {uploading && (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Uploading…</span><span>{uploadProgress}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${uploadProgress}%` }} />
                        </div>
                      </div>
                    )}
                    <button onClick={handleFileUpload} disabled={uploading || !uploadFile}
                      className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 text-sm hover:bg-primary/90 transition-all">
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      {uploading ? "Uploading…" : "Upload & Mark Completed"}
                    </button>
                    <p className="text-xs text-muted-foreground text-center">File is stored securely. Student downloads after balance payment.</p>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Google Drive / Dropbox URL</label>
                      <div className="flex items-center gap-2 bg-background border-2 border-border rounded-xl px-3 focus-within:border-primary transition-colors">
                        <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
                        <input value={fileLink} onChange={e => setFileLink(e.target.value)}
                          className="flex-1 p-3 bg-transparent outline-none text-sm" placeholder="https://drive.google.com/…" />
                      </div>
                    </div>
                    <div className="text-center text-xs text-muted-foreground font-medium">— or direct file URL —</div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Direct File URL</label>
                      <input value={fileUrl} onChange={e => setFileUrl(e.target.value)}
                        className="w-full p-3 rounded-xl bg-background border-2 border-border outline-none focus:border-primary transition-colors text-sm"
                        placeholder="https://…" />
                    </div>
                    <button onClick={handleComplete} disabled={isCompleting || (!fileUrl && !fileLink)}
                      className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 text-sm hover:bg-primary/90 transition-all">
                      {isCompleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Submit & Mark Completed
                    </button>
                    <p className="text-xs text-muted-foreground text-center">After submission, student pays balance to download</p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Storage-uploaded file (edit / delete / re-upload) ── */}
          {hasStorageFile && (
            <div className="relative overflow-hidden bg-card/70 backdrop-blur-sm border border-emerald-500/30 rounded-2xl shadow-sm ring-1 ring-emerald-500/20">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent pointer-events-none" />
              <div className="relative flex items-center justify-between gap-2.5 px-5 py-4 border-b border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 to-transparent">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-400 bg-emerald-500/15">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-foreground block">Uploaded Research File</span>
                    <span className="text-[11px] text-emerald-400/80">Stored securely in cloud</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadCompleted}
                    disabled={downloadingCompleted}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/40 text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-60"
                  >
                    {downloadingCompleted ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                    Download
                  </button>
                  <button
                    onClick={() => setShowDeleteDialog(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-destructive/30 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" /> Delete & Re-upload
                  </button>
                </div>
              </div>
              <div className="relative p-5">
                <div className="flex items-center gap-3 p-3.5 bg-emerald-500/8 border border-emerald-500/20 rounded-xl">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-emerald-400 truncate">
                      {(storagePath || "").split("/").pop() || "Completed file"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {storagePath}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5">
                  <RefreshCw className="w-3 h-3 shrink-0" />
                  To replace this file, click <strong className="text-foreground">Delete &amp; Re-upload</strong> above. The file will be permanently removed from storage.
                </p>
              </div>
            </div>
          )}

          {/* ── URL-based submitted work (edit) ── */}
          {alreadySubmittedUrl && (
            <div className="bg-card/70 backdrop-blur-sm border border-border rounded-2xl shadow-sm ring-1 ring-border/50 overflow-hidden">
              <div className="flex items-center justify-between gap-2.5 px-5 py-4 border-b border-border/50 bg-gradient-to-r from-muted/30 to-transparent">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-400 bg-emerald-500/10">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-bold text-foreground">Submitted Work</span>
                </div>
                {!isEditingUrl && (
                  <button onClick={handleStartEditUrl}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                    <Pencil className="w-3 h-3" /> Edit URL
                  </button>
                )}
              </div>
              <div className="p-5">
                {isEditingUrl ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Google Drive / External Link</label>
                      <div className="flex items-center gap-2 bg-background border-2 border-border rounded-xl px-3 focus-within:border-primary transition-colors">
                        <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
                        <input value={editFileLink} onChange={e => setEditFileLink(e.target.value)}
                          className="flex-1 p-3 bg-transparent outline-none text-sm" placeholder="https://drive.google.com/…" />
                      </div>
                    </div>
                    <div className="text-center text-xs text-muted-foreground">— or direct file URL —</div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Direct File URL</label>
                      <input value={editFileUrl} onChange={e => setEditFileUrl(e.target.value)}
                        className="w-full p-3 rounded-xl bg-background border-2 border-border outline-none focus:border-primary transition-colors text-sm"
                        placeholder="https://…" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleSaveUrl} disabled={isUpdatingUrl || (!editFileUrl && !editFileLink)}
                        className="flex-1 py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors">
                        {isUpdatingUrl ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Changes
                      </button>
                      <button onClick={() => setIsEditingUrl(false)}
                        className="px-4 py-2.5 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors flex items-center gap-1.5">
                        <X className="w-4 h-4" /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {order.completedFileLink && (
                      <a href={order.completedFileLink} download rel="noreferrer"
                        className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 font-medium text-sm hover:bg-emerald-500/20 transition-colors">
                        <ExternalLink className="w-4 h-4" /> Download: Drive / External Link
                      </a>
                    )}
                    {order.completedFileUrl && order.completedFileUrl !== order.completedFileLink && (
                      <a href={order.completedFileUrl} download rel="noreferrer"
                        className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 font-medium text-sm hover:bg-emerald-500/20 transition-colors">
                        <ExternalLink className="w-4 h-4" /> Download: Direct File URL
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {order.status === "pending_payment" && (
            <div className="bg-muted/20 border border-border/50 p-4 rounded-2xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <span className="text-xs text-muted-foreground leading-relaxed">Waiting for the student to pay the deposit before work begins.</span>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Delete file confirmation dialog ── */}
      <AnimatePresence>
        {showDeleteDialog && (
          <>
            <motion.div
              key="delete-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
              onClick={() => !deletingFile && setShowDeleteDialog(false)}
            />
            <motion.div
              key="delete-dialog"
              initial={{ opacity: 0, scale: 0.93, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.93, y: 16 }}
              transition={{ duration: 0.28, ease: EASE }}
              className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md px-4"
            >
              <div className="relative overflow-hidden rounded-3xl border border-destructive/30 bg-card/95 backdrop-blur-xl shadow-2xl ring-1 ring-destructive/20">
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/8 via-transparent to-orange-500/5 pointer-events-none" />
                <div className="relative p-7">
                  <div className="flex justify-center mb-5">
                    <div className="w-16 h-16 rounded-2xl bg-destructive/15 border border-destructive/30 flex items-center justify-center shadow-lg shadow-destructive/10">
                      <Trash2 className="w-8 h-8 text-destructive" />
                    </div>
                  </div>
                  <h2 className="text-xl font-extrabold text-foreground text-center mb-2">
                    Delete Uploaded File?
                  </h2>
                  <p className="text-sm text-muted-foreground text-center leading-relaxed mb-6">
                    This will permanently remove the file from cloud storage and reset the order status so you can re-upload.
                    <span className="block mt-2 text-destructive/80 font-medium">This cannot be undone.</span>
                  </p>
                  <div className="space-y-2.5 mb-7 bg-muted/20 rounded-2xl p-4 border border-border/50">
                    {[
                      "The file will be deleted from Supabase Storage permanently.",
                      "Order status will revert to In Progress so you can re-upload.",
                      "The student will not be able to download until you re-submit.",
                    ].map((point, i) => (
                      <div key={i} className="flex items-start gap-2.5 text-xs text-muted-foreground">
                        <div className="w-1.5 h-1.5 rounded-full bg-destructive/60 mt-1.5 shrink-0" />
                        <span>{point}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => setShowDeleteDialog(false)}
                      disabled={deletingFile}
                      className="flex-1 py-3 rounded-xl font-bold text-sm border border-border text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors disabled:opacity-50"
                    >
                      Keep File
                    </button>
                    <motion.button
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={handleDeleteFile}
                      disabled={deletingFile}
                      className="flex-1 py-3 rounded-xl font-bold text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90 flex items-center justify-center gap-2 shadow-lg shadow-destructive/25 disabled:opacity-60 transition-colors"
                    >
                      {deletingFile
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</>
                        : <><Trash2 className="w-4 h-4" /> Yes, Delete File</>
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
