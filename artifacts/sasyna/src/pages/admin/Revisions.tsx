import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { formatDate } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, MessageSquare, CheckCircle, Clock, Send, ExternalLink,
  RefreshCw, Pencil, Sparkles, X, CloudUpload, Link2, FileText, Trash2, Download
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

type Revision = {
  id: string;
  orderId: string;
  orderDisplayId: string;
  studentId: string;
  description: string;
  fileUrl?: string;
  status: string;
  adminResponse?: string;
  correctedFileUrl?: string;
  correctedFileLink?: string;
  correctedFileStoragePath?: string;
  createdAt: string;
  updatedAt: string;
};

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

const STATUS_CONFIG = {
  pending:   { label: "Pending",   color: "text-amber-400",   bg: "bg-amber-500/10",   ring: "ring-amber-500/30",   bar: "bg-amber-500",   icon: Clock },
  in_review: { label: "In Review", color: "text-sky-400",     bg: "bg-sky-500/10",     ring: "ring-sky-500/30",     bar: "bg-sky-500",     icon: RefreshCw },
  resolved:  { label: "Resolved",  color: "text-emerald-400", bg: "bg-emerald-500/10", ring: "ring-emerald-500/30", bar: "bg-emerald-500", icon: CheckCircle },
};
function getStatus(s: string) { return STATUS_CONFIG[s as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending; }

function Orbs() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
      <div className="absolute -top-20 -right-20 w-[400px] h-[400px] rounded-full bg-amber-600/7 blur-[100px] animate-pulse" style={{ animationDuration: "7s" }} />
      <div className="absolute bottom-0 left-1/4 w-[350px] h-[350px] rounded-full bg-emerald-500/6 blur-[90px] animate-pulse" style={{ animationDuration: "9s", animationDelay: "3s" }} />
    </div>
  );
}

export default function AdminRevisions() {
  const { toast } = useToast();
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRevision, setActiveRevision] = useState<Revision | null>(null);
  const [activeMode, setActiveMode] = useState<"respond" | "edit">("respond");
  const [responding, setResponding] = useState(false);
  const [form, setForm] = useState({ adminResponse: "", correctedFileLink: "", correctedFileUrl: "" });
  const [submitMode, setSubmitMode] = useState<"upload" | "url">("upload");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadRevisions = async () => {
    setLoading(true);
    try {
      const auth = await getAuthHeaders();
      const res = await fetch("/api/revisions", { headers: auth });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to load revisions"); }
      setRevisions(await res.json());
    } catch (err) {
      toast({ title: "Error loading revisions", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRevisions(); }, []);

  const resetModal = () => {
    setActiveRevision(null);
    setForm({ adminResponse: "", correctedFileLink: "", correctedFileUrl: "" });
    setUploadFile(null);
    setSubmitMode("upload");
  };

  const openRespond = (r: Revision) => {
    setActiveRevision(r);
    setActiveMode("respond");
    setForm({ adminResponse: "", correctedFileLink: "", correctedFileUrl: "" });
    setUploadFile(null);
    setSubmitMode("upload");
  };

  const openEdit = (r: Revision) => {
    setActiveRevision(r);
    setActiveMode("edit");
    setForm({ adminResponse: r.adminResponse || "", correctedFileLink: r.correctedFileLink || "", correctedFileUrl: r.correctedFileUrl || "" });
    setUploadFile(null);
    setSubmitMode(r.correctedFileStoragePath ? "upload" : "url");
  };

  const handleDownloadCorrected = async (revision: Revision) => {
    if (!revision.correctedFileStoragePath) return;
    setDownloadingId(revision.id);
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`/api/revisions/${revision.id}/corrected-download-url`, { headers: auth });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to get download URL");
      window.open(data.url, "_blank");
    } catch (err) {
      toast({ title: "Download failed", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleRespond = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRevision) return;
    if (!form.adminResponse.trim()) {
      toast({ title: "Response required", description: "Please write a response", variant: "destructive" }); return;
    }

    setResponding(true);
    try {
      const auth = await getAuthHeaders();

      let correctedFileStoragePath: string | undefined;

      if (submitMode === "upload" && uploadFile) {
        setUploading(true);
        const ext = uploadFile.name.split(".").pop() || "docx";
        const storagePath = `${activeRevision.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("revisions")
          .upload(storagePath, uploadFile, { contentType: uploadFile.type, upsert: true });
        setUploading(false);
        if (uploadError) throw new Error(uploadError.message);
        correctedFileStoragePath = storagePath;
      }

      const body = {
        adminResponse: form.adminResponse.trim(),
        correctedFileStoragePath: correctedFileStoragePath || undefined,
        correctedFileLink: submitMode === "url" ? (form.correctedFileLink.trim() || undefined) : undefined,
        correctedFileUrl: submitMode === "url" ? (form.correctedFileUrl.trim() || undefined) : undefined,
        status: "resolved",
      };

      let res: Response;
      if (activeMode === "edit") {
        res = await fetch(`/api/revisions/${activeRevision.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...auth },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`/api/revisions/${activeRevision.id}/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...auth },
          body: JSON.stringify(body),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save response");
      toast({ title: activeMode === "edit" ? "Response updated!" : "Revision resolved!", description: "The student will see your corrected file." });
      setRevisions(prev => prev.map(r => r.id === activeRevision.id ? data : r));
      resetModal();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setResponding(false);
      setUploading(false);
    }
  };

  const pending = revisions.filter(r => r.status === "pending");
  const resolved = revisions.filter(r => r.status === "resolved");

  return (
    <DashboardLayout>
      <Orbs />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold uppercase tracking-widest text-amber-400">Researcher Panel</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Revision Requests</h1>
            <p className="mt-1 text-muted-foreground">Review and respond to student correction requests.</p>
          </div>
          <motion.button onClick={loadRevisions} disabled={loading} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border/60 text-muted-foreground hover:bg-muted/40 transition-colors text-sm font-medium bg-card/60 backdrop-blur-sm shadow-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </motion.button>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1, ease: EASE }}
        className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "Pending", count: pending.length, icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10", ring: "ring-amber-500/20" },
          { label: "Resolved", count: resolved.length, icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10", ring: "ring-emerald-500/20" },
          { label: "Total", count: revisions.length, icon: MessageSquare, color: "text-blue-400", bg: "bg-blue-500/10", ring: "ring-blue-500/20" },
        ].map(({ label, count, icon: Icon, color, bg, ring }, i) => (
          <motion.div key={label} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 + i * 0.08 }}
            whileHover={{ y: -3, scale: 1.02 }}
            className={`bg-card/70 backdrop-blur-sm border border-border rounded-2xl p-4 sm:p-5 shadow-sm ring-1 ${ring} flex items-center gap-3 sm:gap-4`}>
            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
              <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${color}`} />
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-extrabold text-foreground">{count}</div>
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : revisions.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="bg-card/70 backdrop-blur-sm border border-border rounded-2xl p-14 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-8 h-8 text-muted-foreground/30" />
          </div>
          <div className="text-lg font-bold text-foreground mb-1">No revision requests</div>
          <p className="text-sm text-muted-foreground">Revision requests from students will appear here.</p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {revisions.map((revision, i) => {
            const cfg = getStatus(revision.status);
            const StatusIcon = cfg.icon;
            const isDownloading = downloadingId === revision.id;
            return (
              <motion.div key={revision.id}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.05, ease: EASE }}
                className={`relative bg-card/70 backdrop-blur-sm border border-border rounded-2xl overflow-hidden shadow-sm ring-1 ${cfg.ring}`}>
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${cfg.bar}`} />
                <div className="pl-5 pr-5 pt-4 pb-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap mb-2">
                        <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">{revision.orderDisplayId}</span>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ring-1 ${cfg.color} ${cfg.bg} ${cfg.ring}`}>
                          <StatusIcon className="w-3 h-3" />{cfg.label}
                        </span>
                      </div>
                      <p className="text-sm text-foreground leading-relaxed">{revision.description}</p>
                      {revision.fileUrl && (
                        <a href={revision.fileUrl} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 mt-2 text-xs text-primary hover:underline">
                          <ExternalLink className="w-3 h-3" /> Student file
                        </a>
                      )}
                    </div>
                    <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 shrink-0">
                      <p className="text-xs text-muted-foreground">{formatDate(revision.createdAt)}</p>
                      {revision.status === "pending" && (
                        <motion.button onClick={() => openRespond(revision)} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                          className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm shadow-primary/20 hover:opacity-90 transition-opacity"
                          style={{ background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)" }}>
                          Respond
                        </motion.button>
                      )}
                      {revision.status === "resolved" && (
                        <motion.button onClick={() => openEdit(revision)} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                          className="flex items-center gap-1.5 px-4 py-2 bg-muted text-foreground rounded-xl text-xs font-semibold hover:bg-muted/80 transition-colors border border-border">
                          <Pencil className="w-3 h-3" /> Edit
                        </motion.button>
                      )}
                    </div>
                  </div>

                  {revision.adminResponse && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                      className="mt-3 p-4 bg-emerald-500/8 border border-emerald-500/20 rounded-xl space-y-2">
                      <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Your Response</p>
                      <p className="text-sm text-foreground">{revision.adminResponse}</p>
                      {revision.correctedFileStoragePath && (
                        <button onClick={() => handleDownloadCorrected(revision)} disabled={isDownloading}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-60">
                          {isDownloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                          {isDownloading ? "Preparing…" : "Download corrected file"}
                        </button>
                      )}
                      {(revision.correctedFileLink || revision.correctedFileUrl) && !revision.correctedFileStoragePath && (
                        <a href={revision.correctedFileLink || revision.correctedFileUrl} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:underline">
                          <ExternalLink className="w-3 h-3" /> View corrected file
                        </a>
                      )}
                    </motion.div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── Response / Edit Modal ── */}
      <AnimatePresence>
        {activeRevision && (
          <>
            <motion.div key="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              onClick={() => !responding && resetModal()} />
            <motion.div key="modal"
              initial={{ opacity: 0, scale: 0.93, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.93, y: 16 }}
              transition={{ duration: 0.28, ease: EASE }}
              className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg px-4">
              <div className="relative overflow-hidden bg-card border border-border rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 via-transparent to-primary/3 pointer-events-none" />

                {/* Modal header */}
                <div className="relative flex items-center justify-between p-5 border-b border-border">
                  <div>
                    <h3 className="text-base font-bold text-foreground">
                      {activeMode === "edit" ? "Edit Revision Response" : "Respond to Revision"}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Order: <span className="font-mono font-bold text-primary">{activeRevision.orderDisplayId}</span>
                    </p>
                  </div>
                  <button onClick={() => !responding && resetModal()} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="relative p-5 space-y-5">
                  {/* Student's request summary */}
                  <div className="bg-muted/30 rounded-xl p-4">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Student's Request</p>
                    <p className="text-sm text-foreground">{activeRevision.description}</p>
                  </div>

                  <form onSubmit={handleRespond} className="space-y-4">
                    {/* Written response */}
                    <div>
                      <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-2">Your Response <span className="text-destructive">*</span></label>
                      <textarea value={form.adminResponse} onChange={e => setForm(f => ({ ...f, adminResponse: e.target.value }))}
                        rows={3} placeholder="Explain what you corrected or changed…" required
                        className="w-full px-4 py-3 rounded-xl border-2 border-border bg-background text-foreground text-sm resize-none focus:outline-none focus:border-primary transition-colors" />
                    </div>

                    {/* File delivery — mode tabs */}
                    <div>
                      <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-3">Corrected File</label>
                      <div className="flex rounded-xl border border-border overflow-hidden mb-4">
                        {([["upload", CloudUpload, "Upload File"], ["url", Link2, "Enter URL"]] as const).map(([mode, Icon, label]) => (
                          <button key={mode} type="button" onClick={() => setSubmitMode(mode)}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-all ${submitMode === mode ? "bg-primary/10 text-primary border-b-2 border-primary" : "text-muted-foreground hover:bg-muted/50"}`}>
                            <Icon className="w-4 h-4" />{label}
                          </button>
                        ))}
                      </div>

                      {submitMode === "upload" ? (
                        <div>
                          <input ref={fileInputRef} type="file"
                            accept=".pdf,.doc,.docx,.zip"
                            className="hidden"
                            onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                          {uploadFile ? (
                            <div className="flex items-center gap-3 p-3.5 bg-primary/5 border border-primary/20 rounded-xl">
                              <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                                <FileText className="w-4 h-4 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">{uploadFile.name}</p>
                                <p className="text-xs text-muted-foreground">{(uploadFile.size / 1024 / 1024).toFixed(2)} MB</p>
                              </div>
                              <button type="button" onClick={() => { setUploadFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => fileInputRef.current?.click()}
                              className="w-full flex flex-col items-center gap-2 p-6 border-2 border-dashed border-border rounded-xl hover:border-primary/50 hover:bg-primary/3 transition-all group">
                              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                                <CloudUpload className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                              </div>
                              <div className="text-center">
                                <p className="text-sm font-semibold text-foreground">Click to select file</p>
                                <p className="text-xs text-muted-foreground mt-0.5">PDF, DOC, DOCX, ZIP · max 50 MB</p>
                              </div>
                            </button>
                          )}
                          {activeRevision.correctedFileStoragePath && !uploadFile && (
                            <p className="mt-2 text-xs text-emerald-400 flex items-center gap-1.5">
                              <CheckCircle className="w-3 h-3" />
                              File already uploaded — select a new one to replace it
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Google Drive / Dropbox Link</label>
                            <div className="flex items-center gap-2 bg-background border-2 border-border rounded-xl px-3 focus-within:border-primary transition-colors">
                              <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
                              <input value={form.correctedFileLink} onChange={e => setForm(f => ({ ...f, correctedFileLink: e.target.value }))}
                                placeholder="https://drive.google.com/…"
                                className="flex-1 p-3 bg-transparent outline-none text-sm" />
                            </div>
                          </div>
                          <div className="text-center text-xs text-muted-foreground font-medium">— or direct file URL —</div>
                          <div>
                            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Direct File URL</label>
                            <input value={form.correctedFileUrl} onChange={e => setForm(f => ({ ...f, correctedFileUrl: e.target.value }))}
                              placeholder="https://…"
                              className="w-full p-3 rounded-xl bg-background border-2 border-border outline-none focus:border-primary transition-colors text-sm" />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3 pt-1">
                      <motion.button type="submit" disabled={responding || uploading}
                        whileHover={{ scale: (responding || uploading) ? 1 : 1.01 }} whileTap={{ scale: 0.98 }}
                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm disabled:opacity-60 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
                        {(responding || uploading) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        {uploading ? "Uploading file…" : responding ? "Saving…" : activeMode === "edit" ? "Update Response" : "Send & Resolve"}
                      </motion.button>
                      <button type="button" onClick={() => !responding && resetModal()}
                        className="flex-1 py-3 border border-border rounded-xl font-semibold text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
