import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, FileText, Settings, LogOut, RefreshCw,
  Menu, X, Users, DollarSign, Bell, MessageSquare, Wallet, BarChart3, RotateCcw,
  GraduationCap, ClipboardList, Send, Loader2, CheckCheck, Trash2, Check, KeyRound
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { ThemePanel } from "./ThemeCustomizer";
import { supabase } from "@/lib/supabase";

const LOGO = "https://iili.io/q16t9bR.png";

const NAV_ITEMS = {
  student: [
    { label: "Dashboard", href: "/student/dashboard", icon: LayoutDashboard },
    { label: "Research Studio", href: "/student/research", icon: FileText },
    { label: "Revisions", href: "/student/revisions", icon: RefreshCw },
  ],
  admin: [
    { label: "Workspace", href: "/admin/dashboard", icon: LayoutDashboard },
    { label: "Revisions", href: "/admin/revisions", icon: MessageSquare },
    { label: "My Earnings", href: "/admin/earnings", icon: DollarSign },
    { label: "Wallet Settings", href: "/admin/wallet-settings", icon: Wallet },
  ],
  superadmin: [
    { label: "Overview", href: "/superadmin/dashboard", icon: LayoutDashboard },
    { label: "Revenue", href: "/superadmin/revenue", icon: BarChart3 },
    { label: "Orders", href: "/superadmin/orders", icon: ClipboardList },
    { label: "Students", href: "/superadmin/students", icon: GraduationCap },
    { label: "Admins", href: "/superadmin/admins", icon: Users },
    { label: "Withdrawals", href: "/superadmin/withdrawals", icon: Wallet },
    { label: "Refunds", href: "/superadmin/refunds", icon: RotateCcw },
    { label: "Pricing", href: "/superadmin/pricing", icon: Settings },
    { label: "Revisions", href: "/superadmin/revisions", icon: MessageSquare },
    { label: "Account Settings", href: "/superadmin/settings", icon: KeyRound },
  ],
} as const;

type Role = keyof typeof NAV_ITEMS;

type Notification = {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  title: string;
  message: string;
  isPublic: boolean;
  isRead: boolean;
  createdAt: string;
};

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    + " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function NotificationPanel({ role, userId, onClose, onUnreadChange }: { role: string; userId: string; onClose: () => void; onUnreadChange: (count: number) => void }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendMode, setSendMode] = useState(false);
  const [form, setForm] = useState({ recipientEmail: "", displayName: "", title: "", message: "", isPublic: false });
  const [searchResults, setSearchResults] = useState<{ id: string; email: string; full_name: string; role: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const auth = await getAuthHeaders();
      const res = await fetch("/api/notifications", { headers: auth });
      if (res.ok) {
        const data: Notification[] = await res.json();
        setNotifications(data);
        onUnreadChange(data.filter(n => !n.isRead).length);
      }
    } catch { } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const markAllRead = async () => {
    const auth = await getAuthHeaders();
    await fetch("/api/notifications/mark-all-read", { method: "POST", headers: auth });
    setNotifications(n => n.map(x => ({ ...x, isRead: true })));
    onUnreadChange(0);
  };

  const markOneRead = async (id: string) => {
    const auth = await getAuthHeaders();
    await fetch(`/api/notifications/${id}/read`, { method: "POST", headers: auth });
    setNotifications(prev => {
      const updated = prev.map(n => n.id === id ? { ...n, isRead: true } : n);
      onUnreadChange(updated.filter(n => !n.isRead).length);
      return updated;
    });
  };

  const searchUsers = async (q: string) => {
    if (!q || q.length < 2) { setSearchResults([]); return; }
    const auth = await getAuthHeaders();
    const res = await fetch(`/api/notifications/search-user?email=${encodeURIComponent(q)}`, { headers: auth });
    if (res.ok) setSearchResults(await res.json());
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendError("");
    if (!form.title.trim() || !form.message.trim()) { setSendError("Title and message are required"); return; }
    if (!form.isPublic && !form.recipientEmail) { setSendError("Recipient email is required for private messages"); return; }
    setSending(true);
    try {
      const auth = await getAuthHeaders();
      const body: Record<string, unknown> = {
        title: form.title,
        message: form.message,
        isPublic: form.isPublic,
      };
      if (form.displayName.trim()) body.displayName = form.displayName.trim();
      if (!form.isPublic) {
        body.recipientEmail = form.recipientEmail;
      }
      const res = await fetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      setSendMode(false);
      setForm({ recipientEmail: "", displayName: "", title: "", message: "", isPublic: false });
      load();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const deleteNotification = async (id: string) => {
    const auth = await getAuthHeaders();
    const res = await fetch(`/api/notifications/${id}`, { method: "DELETE", headers: auth });
    if (res.ok) {
      setNotifications(prev => {
        const updated = prev.filter(n => n.id !== id);
        onUnreadChange(updated.filter(n => !n.isRead).length);
        return updated;
      });
    }
  };

  const canSend = role === "superadmin" || role === "admin";
  const unread = notifications.filter(n => !n.isRead).length;

  return (
    <div className="absolute right-0 top-12 w-80 sm:w-96 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="font-bold text-foreground">Notifications {unread > 0 && <span className="ml-1 text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5">{unread}</span>}</div>
        <div className="flex items-center gap-2">
          {unread > 0 && (
            <button onClick={markAllRead} title="Mark all read"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <CheckCheck className="w-4 h-4" />
            </button>
          )}
          {canSend && (
            <button onClick={() => setSendMode(s => !s)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" title="Send notification">
              <Send className="w-4 h-4" />
            </button>
          )}
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {sendMode && (
        <div className="p-4 border-b border-border bg-muted/30">
          <form onSubmit={handleSend} className="space-y-3">
            <div className="text-sm font-semibold text-foreground">Send Notification</div>
            {sendError && <div className="text-xs text-destructive bg-destructive/10 rounded-lg p-2">{sendError}</div>}

            {role === "superadmin" && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={form.isPublic}
                  onChange={e => setForm(f => ({ ...f, isPublic: e.target.checked, recipientEmail: "" }))}
                  className="rounded"
                />
                <label htmlFor="isPublic" className="text-sm text-foreground">Send to everyone</label>
              </div>
            )}

            {!form.isPublic && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Recipient Email</label>
                <div className="relative">
                  <input
                    value={form.recipientEmail}
                    onChange={e => { setForm(f => ({ ...f, recipientEmail: e.target.value })); searchUsers(e.target.value); }}
                    placeholder="Search by email..."
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  {searchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg z-10 overflow-hidden">
                      {searchResults.map(u => (
                        <button key={u.id} type="button"
                          onClick={() => { setForm(f => ({ ...f, recipientEmail: u.email })); setSearchResults([]); }}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-left">
                          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                            {u.full_name?.charAt(0) || u.email?.charAt(0)}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-foreground">{u.full_name}</div>
                            <div className="text-xs text-muted-foreground">{u.email} · {u.role}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {(role === "superadmin" || role === "admin") && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Display Name (shown to recipient)</label>
                <input
                  value={form.displayName}
                  onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                  placeholder="e.g. Sasyna Support (optional)"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            )}

            <div>
              <label className="text-xs text-muted-foreground block mb-1">Title</label>
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Notification title"
                required
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Message</label>
              <textarea
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                placeholder="Your message..."
                required
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={sending}
                className="flex-1 flex items-center justify-center gap-2 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold disabled:opacity-60">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send
              </button>
              <button type="button" onClick={() => setSendMode(false)}
                className="flex-1 py-2 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="overflow-y-auto max-h-80">
        {loading ? (
          <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No notifications yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {notifications.map(n => {
              const canDelete = role === "superadmin" || (role === "admin" && n.senderId === userId);
              return (
                <div key={n.id} className={`p-4 ${n.isRead ? "" : "bg-primary/5"}`}>
                  <div className="flex items-start gap-2 mb-1">
                    {!n.isRead && <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-foreground">{n.title}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!n.isRead && (
                        <button
                          onClick={() => markOneRead(n.id)}
                          className="p-1 rounded-lg text-muted-foreground hover:text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                          title="Mark as read"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => deleteNotification(n.id)}
                          className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Delete notification"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className={`text-sm text-foreground leading-relaxed ${n.isRead ? "" : "pl-4"}`}>{n.message}</p>
                  <div className="text-xs text-muted-foreground mt-1.5 pl-4">
                    {!n.isPublic && <span>From: {n.senderName || "System"} · </span>}
                    {formatDateTime(n.createdAt)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [location] = useLocation();
  const { user, role, name, signOut } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const bellRef = useRef<HTMLDivElement>(null);

  if (!role || !(role in NAV_ITEMS)) return null;
  const navItems = NAV_ITEMS[role as Role];
  const roleLabel = role === "superadmin" ? "Super Admin" : role === "admin" ? "Researcher" : "Student";

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const auth = await getAuthHeaders();
        const res = await fetch("/api/notifications/unread-count", { headers: auth });
        if (res.ok) {
          const data = await res.json();
          setUnreadCount(data.count || 0);
        }
      } catch { }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleBellClick = () => {
    setShowNotifications(s => !s);
  };

  return (
    <div className="min-h-screen bg-background flex">
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-2xl lg:shadow-none transition-transform duration-300 lg:translate-x-0 lg:static lg:flex flex-col",
          isSidebarOpen ? "translate-x-0 flex" : "-translate-x-full"
        )}
      >
        <div className="h-20 flex items-center px-6 border-b border-sidebar-border shrink-0">
          <Link href="/" className="flex items-center gap-3 flex-1 min-w-0">
            <img src={LOGO} alt="Sasyna" className="w-10 h-10 rounded-xl object-contain shadow-md shadow-primary/20 shrink-0" />
            <div className="overflow-hidden">
              <div className="text-xl font-extrabold text-white tracking-tight leading-tight">Sasyna</div>
              <div className="text-[10px] font-medium text-sidebar-foreground/50 leading-none">The World of Research</div>
            </div>
          </Link>
          <button className="ml-auto lg:hidden text-sidebar-foreground/70 shrink-0" onClick={() => setSidebarOpen(false)}>
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="px-6 pt-5 pb-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/20 text-primary text-xs font-bold uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            {roleLabel}
          </span>
        </div>

        <div className="flex-1 py-4 px-4 space-y-1 overflow-y-auto">
          <div className="px-2 mb-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/40">Navigation</div>
          {navItems.map((item) => {
            const isActive = location === item.href || location.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)}>
                <div className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200 cursor-pointer group",
                  isActive
                    ? "bg-sidebar-accent text-white shadow-lg shadow-primary/20"
                    : "text-sidebar-foreground/60 hover:bg-white/5 hover:text-sidebar-foreground"
                )}>
                  <item.icon className={cn(
                    "w-5 h-5 shrink-0 transition-colors",
                    isActive ? "text-white" : "text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70"
                  )} />
                  <span className="text-sm">{item.label}</span>
                  {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white/70" />}
                </div>
              </Link>
            );
          })}
        </div>

        <div className="px-4 py-2">
          <ThemePanel />
        </div>

        <div className="p-4 border-t border-sidebar-border shrink-0">
          <div className="flex items-center gap-3 px-3 py-3 bg-white/5 rounded-xl mb-3">
            <div className="w-9 h-9 rounded-full bg-primary/30 text-white flex items-center justify-center font-bold text-sm shrink-0">
              {(name || user?.email || "U").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="font-semibold text-sm text-white truncate">
                {name || user?.email?.split('@')[0] || 'User'}
              </div>
              <div className="text-xs text-sidebar-foreground/50 truncate">{user?.email}</div>
            </div>
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-sidebar-foreground/50 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-16 bg-background/90 backdrop-blur-md border-b border-border sticky top-0 z-30 flex items-center justify-between px-4 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              className="p-2 -ml-1 text-foreground/60 hover:text-foreground hover:bg-muted rounded-lg lg:hidden transition-colors"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 lg:hidden">
              <img src={LOGO} alt="Sasyna" className="w-7 h-7 rounded-lg object-contain" />
              <span className="font-bold text-foreground text-sm">Sasyna</span>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-full text-xs font-medium text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {roleLabel}
            </div>

            <div ref={bellRef} className="relative">
              <button
                onClick={handleBellClick}
                className="p-2 rounded-full bg-muted/50 hover:bg-muted text-muted-foreground transition-colors relative"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              {showNotifications && (
                <NotificationPanel
                  role={role}
                  userId={user?.id || ""}
                  onClose={() => setShowNotifications(false)}
                  onUnreadChange={setUnreadCount}
                />
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8 scroll-smooth">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="max-w-7xl mx-auto"
          >
            {children}
          </motion.div>
        </div>
      </main>

    </div>
  );
}
