import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Wallet, Building2, Phone, Save, Loader2, CheckCircle, AlertCircle, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

const KENYAN_BANKS = [
  "Kenya Commercial Bank (KCB)", "Equity Bank Kenya", "Co-operative Bank of Kenya", "Absa Bank Kenya",
  "Standard Chartered Bank Kenya", "I&M Bank Kenya", "Diamond Trust Bank (DTB)", "Stanbic Bank Kenya",
  "NCBA Bank Kenya", "Family Bank", "HF Group", "Gulf African Bank", "Bank of Africa Kenya", "Prime Bank Kenya",
  "Guardian Bank", "SBM Bank Kenya", "UBA Kenya Bank", "Mayfair CIB Bank", "Victoria Commercial Bank",
  "Consolidated Bank Kenya", "Credit Bank", "National Bank of Kenya", "Sidian Bank", "Spire Bank", "Trans National Bank Kenya",
];

type WalletData = {
  walletType: string | null;
  walletMpesaNumber: string | null;
  walletBankName: string | null;
  walletBankAccountNumber: string | null;
  walletBankAccountName: string | null;
};

const API_BASE = "/api";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

function Orbs() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
      <div className="absolute -top-20 right-0 w-[350px] h-[350px] rounded-full bg-emerald-600/8 blur-[90px] animate-pulse" style={{ animationDuration: "8s" }} />
      <div className="absolute bottom-0 left-0 w-[320px] h-[320px] rounded-full bg-blue-500/6 blur-[80px] animate-pulse" style={{ animationDuration: "10s", animationDelay: "3s" }} />
    </div>
  );
}

export default function AdminWalletSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [walletType, setWalletType] = useState<"mpesa" | "bank">("mpesa");
  const [mpesaNumber, setMpesaNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const auth = await getAuthHeaders();
        const res = await fetch(`${API_BASE}/profile/wallet`, { headers: auth });
        if (!res.ok) throw new Error("Failed to load");
        const data: WalletData = await res.json();
        if (data.walletType) {
          setWalletType(data.walletType as "mpesa" | "bank");
          setMpesaNumber(data.walletMpesaNumber || "");
          setBankName(data.walletBankName || "");
          setAccountNumber(data.walletBankAccountNumber || "");
          setAccountName(data.walletBankAccountName || "");
        }
      } catch {
        toast({ title: "Error", description: "Failed to load wallet details", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setSaved(false);
    try {
      const auth = await getAuthHeaders();
      const body: Record<string, string> = { walletType };
      if (walletType === "mpesa") body.walletMpesaNumber = mpesaNumber;
      else { body.walletBankName = bankName; body.walletBankAccountNumber = accountNumber; body.walletBankAccountName = accountName; }
      const res = await fetch(`${API_BASE}/profile/wallet`, { method: "PATCH", headers: { "Content-Type": "application/json", ...auth }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSaved(true);
      toast({ title: "Wallet details saved", description: "Your payment details have been updated." });
      setTimeout(() => setSaved(false), 4000);
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <Orbs />
      <div className="max-w-2xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="mb-8">
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-emerald-400" />
            </div>
            Wallet Settings
          </h1>
          <p className="mt-2 text-muted-foreground">
            Set your preferred payment method for withdrawals. Only shared with the withdraw manager.
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.1, ease: EASE }}
          className="bg-blue-500/8 border border-blue-500/20 rounded-2xl p-4 mb-6 flex gap-3">
          <AlertCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-300/80">
            You must set your wallet details before you can request a withdrawal.
          </div>
        </motion.div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-500 animate-spin" />
            </div>
          </div>
        ) : (
          <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.2, ease: EASE }}
            onSubmit={handleSave}
            className="bg-card/70 backdrop-blur-sm border border-border rounded-2xl shadow-lg ring-1 ring-border/50 p-6 sm:p-8 space-y-6">

            {/* Wallet Type */}
            <div>
              <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-3">Payment Method</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { type: "mpesa" as const, icon: Phone, label: "M-Pesa", sub: "Mobile money transfer" },
                  { type: "bank" as const, icon: Building2, label: "Bank Account", sub: "Direct bank transfer" },
                ].map(({ type, icon: Icon, label, sub }) => (
                  <motion.button key={type} type="button" onClick={() => setWalletType(type)}
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    className={cn(
                      "flex items-center gap-3 p-4 rounded-xl border-2 transition-all",
                      walletType === type
                        ? "border-primary/60 bg-primary/10 shadow-sm shadow-primary/20"
                        : "border-border hover:border-primary/30"
                    )}>
                    <Icon className={cn("w-5 h-5 flex-shrink-0", walletType === type ? "text-primary" : "text-muted-foreground")} />
                    <div className="text-left">
                      <div className={cn("font-bold text-sm", walletType === type ? "text-primary" : "text-foreground")}>{label}</div>
                      <div className="text-xs text-muted-foreground">{sub}</div>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* M-Pesa */}
            {walletType === "mpesa" && (
              <div>
                <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-2">
                  M-Pesa Number <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="text" value={mpesaNumber} onChange={e => setMpesaNumber(e.target.value)}
                    placeholder="e.g. 0712 345 678 or 254712345678" required
                    className="w-full pl-11 pr-4 py-3 rounded-xl border-2 border-border bg-background text-foreground text-sm focus:outline-none focus:border-primary transition-colors" />
                </div>
              </div>
            )}

            {/* Bank */}
            {walletType === "bank" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-2">
                    Bank Name <span className="text-destructive">*</span>
                  </label>
                  <select value={bankName} onChange={e => setBankName(e.target.value)} required
                    className="w-full appearance-none px-4 py-3 rounded-xl border-2 border-border bg-background text-foreground text-sm focus:outline-none focus:border-primary transition-colors">
                    <option value="">— Select your bank —</option>
                    {KENYAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-2">
                    Account Number <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input type="text" value={accountNumber} onChange={e => setAccountNumber(e.target.value)}
                      placeholder="Your bank account number" required
                      className="w-full pl-11 pr-4 py-3 rounded-xl border-2 border-border bg-background text-foreground text-sm focus:outline-none focus:border-primary transition-colors" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-2">
                    Account Name <span className="text-destructive">*</span>
                  </label>
                  <input type="text" value={accountName} onChange={e => setAccountName(e.target.value)}
                    placeholder="Full name exactly as registered" required
                    className="w-full px-4 py-3 rounded-xl border-2 border-border bg-background text-foreground text-sm focus:outline-none focus:border-primary transition-colors" />
                  <p className="mt-1.5 text-xs text-muted-foreground">Name as it appears on your bank account to avoid transfer failures.</p>
                </div>
              </div>
            )}

            <motion.button type="submit" disabled={saving}
              whileHover={{ scale: saving ? 1 : 1.01, y: saving ? 0 : -1 }} whileTap={{ scale: 0.98 }}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary text-primary-foreground rounded-xl font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:bg-primary/90 transition-all disabled:opacity-60">
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
              ) : saved ? (
                <><CheckCircle className="w-4 h-4" /> Saved!</>
              ) : (
                <><Save className="w-4 h-4" /> Save Wallet Details</>
              )}
            </motion.button>
          </motion.form>
        )}
      </div>
    </DashboardLayout>
  );
}
