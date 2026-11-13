import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useGetAdmins, useCreateAdmin, useDeleteAdmin } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDate } from "@/lib/utils";
import { Loader2, Plus, Trash2, X, Eye, EyeOff, ShieldCheck, Phone, CreditCard, Download, Sparkles, Users, KeyRound, Search, Pencil, Save } from "lucide-react";
import { exportToPdf } from "@/lib/exportPdf";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.08, ease: EASE } }),
};

function Orbs() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
      <div className="absolute -top-32 -right-32 w-[480px] h-[480px] rounded-full bg-blue-600/8 blur-[100px] animate-pulse" style={{ animationDuration: "7s" }} />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-violet-500/7 blur-[110px] animate-pulse" style={{ animationDuration: "9s", animationDelay: "2s" }} />
      <div className="absolute inset-0 opacity-[0.02]"
        style={{ backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
    </div>
  );
}

export default function SuperAdminAdmins() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: admins, isLoading } = useGetAdmins();
  const { mutate: createAdmin, isPending: isCreating } = useCreateAdmin();
  const { mutate: deleteAdmin, isPending: isDeleting } = useDeleteAdmin();

  const [showForm, setShowForm] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", nationalId: "", phoneNumber: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [resetTarget, setResetTarget] = useState<{ id: string; name: string } | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [showResetPass, setShowResetPass] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Edit admin state
  const [editTarget, setEditTarget] = useState<{ id: string; name: string; email: string; phoneNumber: string; nationalId: string } | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", phoneNumber: "", nationalId: "" });
  const [editError, setEditError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [search, setSearch] = useState("");

  const filteredAdmins = (admins || []).filter((a: any) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (a.name || "").toLowerCase().includes(q) ||
      (a.email || "").toLowerCase().includes(q) ||
      (a.phoneNumber || "").toLowerCase().includes(q)
    );
  });

  const researcherCount = filteredAdmins.filter((a: any) => a.role !== "superadmin").length;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMsg(null);
    if (!form.name || !form.email || !form.password) { setFormError("Name, email, and password are required."); return; }
    if (!form.nationalId.trim()) { setFormError("National ID number is required."); return; }
    if (!form.phoneNumber.trim()) { setFormError("Phone number is required."); return; }
    createAdmin(
      { data: { name: form.name, email: form.email, password: form.password, nationalId: form.nationalId, phoneNumber: form.phoneNumber } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/superadmin/admins"] });
          setForm({ name: "", email: "", password: "", nationalId: "", phoneNumber: "" });
          setShowForm(false);
          setSuccessMsg("Researcher account created successfully.");
          setTimeout(() => setSuccessMsg(null), 4000);
        },
        onError: (err: Error) => setFormError(err.message || "Failed to create admin."),
      }
    );
  };

  const handleDelete = (adminId: string, name: string) => {
    if (!confirm(`Remove "${name}" from the platform? They will lose access immediately.`)) return;
    deleteAdmin({ adminId }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/superadmin/admins"] }) });
  };

  const openResetModal = (id: string, name: string) => {
    setResetTarget({ id, name });
    setResetPassword("");
    setShowResetPass(false);
    setResetError(null);
  };

  const openEditModal = (admin: any) => {
    setEditTarget({ id: admin.id, name: admin.name || "", email: admin.email || "", phoneNumber: admin.phoneNumber || "", nationalId: admin.nationalId || "" });
    setEditForm({ name: admin.name || "", email: admin.email || "", phoneNumber: admin.phoneNumber || "", nationalId: admin.nationalId || "" });
    setEditError(null);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    if (!resetPassword || resetPassword.length < 6) {
      setResetError("Password must be at least 6 characters.");
      return;
    }
    setIsResetting(true);
    setResetError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/superadmin/admins/${resetTarget.id}/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ newPassword: resetPassword }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reset password");
      }
      toast({ title: "Password Reset", description: `Password for "${resetTarget.name}" has been updated.` });
      setResetTarget(null);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setIsResetting(false);
    }
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    if (!editForm.name.trim()) { setEditError("Name is required."); return; }
    if (!editForm.email.trim()) { setEditError("Email is required."); return; }
    setIsSaving(true);
    setEditError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/superadmin/admins/${editTarget.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          name: editForm.name.trim(),
          email: editForm.email.trim() !== editTarget.email ? editForm.email.trim() : undefined,
          phoneNumber: editForm.phoneNumber.trim(),
          nationalId: editForm.nationalId.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update admin");
      }
      toast({ title: "Details Updated", description: `"${editForm.name}" has been updated successfully.` });
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/admins"] });
      setEditTarget(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update admin");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <Orbs />

      <motion.div variants={fadeUp} custom={0} initial="hidden" animate="show"
        className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-blue-400">Team</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">Researchers / Admins</h1>
          <p className="mt-1.5 text-muted-foreground">Manage who has researcher access to the platform.</p>
        </div>
        <div className="flex items-center gap-3">
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => {
              if (!filteredAdmins.length) return;
              exportToPdf({
                title: "Researchers & Admins Report",
                subtitle: `${search.trim() ? `Filtered by "${search}" — ` : "All platform researchers — "}exported ${new Date().toLocaleDateString("en-GB")}`,
                filename: `researchers-report-${new Date().toISOString().slice(0, 10)}.pdf`,
                columns: [
                  { header: "Name", dataKey: "name" }, { header: "Email", dataKey: "email" },
                  { header: "Phone", dataKey: "phoneNumber" }, { header: "National ID", dataKey: "nationalId" },
                  { header: "Role", dataKey: "role" }, { header: "Completed Orders", dataKey: "completedOrders" },
                  { header: "Wallet Type", dataKey: "walletType" }, { header: "Joined", dataKey: "joinedAt" },
                ],
                rows: filteredAdmins.map((a: any) => ({
                  name: a.name || "—", email: a.email || "—", phoneNumber: a.phoneNumber || "—",
                  nationalId: a.nationalId || "—", role: a.role === "superadmin" ? "Super Admin" : "Researcher",
                  completedOrders: a.completedOrders ?? 0,
                  walletType: a.walletType === "mpesa" ? "M-Pesa" : a.walletType === "bank" ? "Bank" : "Not set",
                  joinedAt: formatDate(a.createdAt),
                })),
              });
            }}
            disabled={!filteredAdmins.length}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card/60 backdrop-blur-sm text-foreground font-medium text-sm hover:bg-muted/60 transition-all disabled:opacity-50 shadow-sm">
            <Download className="w-4 h-4" /> Export PDF
          </motion.button>
          <motion.button whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
            onClick={() => { setShowForm(true); setFormError(null); }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/25 transition-all text-sm">
            <Plus className="w-4 h-4" /> Add Researcher
          </motion.button>
        </div>
      </motion.div>

      {successMsg && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="mb-5 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-medium flex items-center gap-2 backdrop-blur-sm">
          <ShieldCheck className="w-4 h-4 shrink-0" /> {successMsg}
        </motion.div>
      )}

      {showForm && (
        <motion.div initial={{ opacity: 0, y: -10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.3, ease: EASE }}
          className="bg-card/70 backdrop-blur-sm border border-primary/20 rounded-2xl p-6 mb-8 shadow-xl ring-1 ring-primary/20">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-foreground">Add New Researcher</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Create a researcher account with secure credentials.</p>
            </div>
            <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground p-1.5 rounded-xl hover:bg-muted transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          {formError && (
            <div className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm">{formError}</div>
          )}
          <form onSubmit={handleCreate} className="grid sm:grid-cols-2 gap-4">
            {[
              { label: "Full Name", field: "name", placeholder: "John Kamau", type: "text" },
              { label: "Email Address", field: "email", placeholder: "researcher@sasyna.com", type: "email" },
            ].map(({ label, field, placeholder, type }) => (
              <div key={field}>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{label} <span className="text-destructive">*</span></label>
                <input type={type} value={form[field as keyof typeof form]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors" />
              </div>
            ))}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">National ID Number <span className="text-destructive">*</span></label>
              <div className="relative">
                <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="text" value={form.nationalId} onChange={e => setForm(f => ({ ...f, nationalId: e.target.value }))}
                  placeholder="e.g. 12345678"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Phone Number <span className="text-destructive">*</span></label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="text" value={form.phoneNumber} onChange={e => setForm(f => ({ ...f, phoneNumber: e.target.value }))}
                  placeholder="e.g. 0712 345 678"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors" />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Password <span className="text-destructive">*</span></label>
              <div className="relative">
                <input type={showPass ? "text" : "password"} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Min 6 characters"
                  className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors" />
                <button type="button" onClick={() => setShowPass(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <button type="submit" disabled={isCreating}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50 transition-all shadow-md shadow-primary/25 text-sm">
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create Researcher Account
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25, ease: EASE }}
            className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                  <KeyRound className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground">Reset Password</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">For: <span className="font-semibold text-foreground">{resetTarget.name}</span></p>
                </div>
              </div>
              <button onClick={() => setResetTarget(null)} className="text-muted-foreground hover:text-foreground p-1.5 rounded-xl hover:bg-muted transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            {resetError && (
              <div className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm">{resetError}</div>
            )}
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">New Password <span className="text-destructive">*</span></label>
                <div className="relative">
                  <input
                    type={showResetPass ? "text" : "password"}
                    value={resetPassword}
                    onChange={e => setResetPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors"
                  />
                  <button type="button" onClick={() => setShowResetPass(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    {showResetPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setResetTarget(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors text-sm font-medium">
                  Cancel
                </button>
                <button type="submit" disabled={isResetting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-white font-semibold disabled:opacity-50 transition-all shadow-md shadow-amber-500/25 text-sm">
                  {isResetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  Reset Password
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Edit Admin Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25, ease: EASE }}
            className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                  <Pencil className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground">Edit Researcher Details</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Updating: <span className="font-semibold text-foreground">{editTarget.name}</span></p>
                </div>
              </div>
              <button onClick={() => setEditTarget(null)} className="text-muted-foreground hover:text-foreground p-1.5 rounded-xl hover:bg-muted transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            {editError && (
              <div className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm">{editError}</div>
            )}
            <form onSubmit={handleEditSave} className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Full Name <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Full name"
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Email Address <span className="text-destructive">*</span></label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="email@sasyna.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={editForm.phoneNumber}
                    onChange={e => setEditForm(f => ({ ...f, phoneNumber: e.target.value }))}
                    placeholder="e.g. 0712 345 678"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">National ID Number</label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={editForm.nationalId}
                    onChange={e => setEditForm(f => ({ ...f, nationalId: e.target.value }))}
                    placeholder="e.g. 12345678"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors"
                  />
                </div>
              </div>
              <div className="sm:col-span-2 flex gap-3 pt-1">
                <button type="button" onClick={() => setEditTarget(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors text-sm font-medium">
                  Cancel
                </button>
                <button type="submit" disabled={isSaving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50 transition-all shadow-md shadow-primary/25 text-sm">
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Changes
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      <motion.div variants={fadeUp} custom={1} initial="hidden" animate="show">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-4 border-blue-500/20" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-500 animate-spin" />
            </div>
            <p className="text-muted-foreground text-sm">Loading researchers…</p>
          </div>
        ) : (
          <div className="bg-card/60 backdrop-blur-sm border border-border rounded-2xl overflow-hidden shadow-lg ring-1 ring-border/50">
            <div className="p-5 border-b border-border/60 bg-gradient-to-r from-muted/40 to-transparent flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-3 flex-1">
                <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-blue-400" />
                </div>
                <h2 className="font-bold text-foreground">
                  {researcherCount} Researcher{researcherCount !== 1 ? "s" : ""}
                  {search.trim() && <span className="text-muted-foreground font-normal text-sm ml-1.5">matching "{search}"</span>}
                </h2>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name, email or phone…"
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background text-foreground text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-muted/30 text-muted-foreground text-[11px] uppercase tracking-wider">
                    {["Name", "Email", "Phone", "National ID", "Role", "Orders", "Wallet", "Joined", "Actions"].map(h => (
                      <th key={h} className="px-6 py-4 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {!filteredAdmins.length ? (
                    <tr><td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">
                      {search.trim() ? `No researchers match "${search}".` : "No researchers added yet."}
                    </td></tr>
                  ) : (
                    filteredAdmins.map((admin: any) => (
                      <tr key={admin.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                              {admin.name?.charAt(0).toUpperCase() || "A"}
                            </div>
                            <span className="font-semibold text-foreground text-sm">{admin.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground text-sm">{admin.email}</td>
                        <td className="px-6 py-4 text-sm text-foreground font-mono">{admin.phoneNumber || <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-6 py-4 text-sm text-foreground font-mono">{admin.nationalId || <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${admin.role === "superadmin" ? "bg-amber-500/15 text-amber-400" : "bg-blue-500/15 text-blue-400"}`}>
                            {admin.role === "superadmin" ? "Super Admin" : "Researcher"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-foreground font-semibold text-sm">{admin.completedOrders}</td>
                        <td className="px-6 py-4 text-sm">
                          {admin.walletType ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/15 text-emerald-400 rounded-full text-xs font-medium">
                              {admin.walletType === "mpesa" ? "M-Pesa" : "Bank"}
                            </span>
                          ) : <span className="text-muted-foreground text-xs">Not set</span>}
                        </td>
                        <td className="px-6 py-4 text-muted-foreground text-sm">{formatDate(admin.createdAt)}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openEditModal(admin)}
                              className="p-2 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              title="Edit details"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            {admin.role !== "superadmin" && (
                              <button
                                onClick={() => openResetModal(admin.id, admin.name)}
                                className="p-2 rounded-xl text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                                title="Reset password"
                              >
                                <KeyRound className="w-4 h-4" />
                              </button>
                            )}
                            {admin.role !== "superadmin" && (
                              <button onClick={() => handleDelete(admin.id, admin.name)} disabled={isDeleting}
                                className="p-2 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Remove researcher">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
