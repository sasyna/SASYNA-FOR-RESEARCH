import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { formatCurrency } from "@/lib/utils";
import { Loader2, Save, Tag, Percent, CheckCircle2, Info, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

const API_BASE = "/api";
const DEFAULT_LEVELS = ["Diploma", "Higher Diploma", "Upgrading", "Undergraduate", "Masters", "PhD"];
const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.08, ease: EASE } }),
};

type LevelPricing = {
  level: string;
  research_proposal_price: number;
  research_dissertation_price: number;
  complete_research_project_price: number;
  deposit_percentage: number;
};

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

function Orbs() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
      <div className="absolute -top-32 -right-32 w-[460px] h-[460px] rounded-full bg-amber-600/8 blur-[100px] animate-pulse" style={{ animationDuration: "7s" }} />
      <div className="absolute bottom-0 -left-20 w-[380px] h-[380px] rounded-full bg-orange-500/7 blur-[110px] animate-pulse" style={{ animationDuration: "9s", animationDelay: "2s" }} />
      <div className="absolute inset-0 opacity-[0.02]"
        style={{ backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
    </div>
  );
}

export default function SuperAdminPricing() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [depositPercentage, setDepositPercentage] = useState(50);
  const [levels, setLevels] = useState<LevelPricing[]>(
    DEFAULT_LEVELS.map(level => ({
      level,
      research_proposal_price: 1500,
      research_dissertation_price: 1500,
      complete_research_project_price: 2500,
      deposit_percentage: 50,
    }))
  );

  const load = async () => {
    setLoading(true);
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/superadmin/pricing`, { headers: auth });
      if (!res.ok) return;
      const data = await res.json();
      setDepositPercentage(data.depositPercentage || 50);
      if (data.levels && data.levels.length > 0) {
        const existing = data.levels as Array<{
          level: string;
          research_proposal_price: number;
          research_project_price: number;
          complete_research_project_price: number;
          deposit_percentage: number;
        }>;
        const merged = DEFAULT_LEVELS.map(lvl => {
          const found = existing.find(e => e.level === lvl);
          if (found) {
            return {
              level: lvl,
              research_proposal_price: Number(found.research_proposal_price) || data.researchProposalPrice || 1500,
              research_dissertation_price: Number(found.research_project_price) || data.researchDissertationPrice || 1500,
              complete_research_project_price: Number(found.complete_research_project_price) || data.completeResearchProjectPrice || 2500,
              deposit_percentage: Number(found.deposit_percentage) || data.depositPercentage || 50,
            };
          }
          return {
            level: lvl,
            research_proposal_price: data.researchProposalPrice || 1500,
            research_dissertation_price: data.researchDissertationPrice || 1500,
            complete_research_project_price: data.completeResearchProjectPrice || 2500,
            deposit_percentage: data.depositPercentage || 50,
          };
        });
        setLevels(merged);
      }
    } catch {
      toast({ title: "Error", description: "Failed to load pricing", variant: "destructive" });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/superadmin/pricing`, {
        method: "PATCH",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          depositPercentage,
          levels: levels.map(l => ({
            level: l.level,
            research_proposal_price: l.research_proposal_price,
            research_dissertation_price: l.research_dissertation_price,
            complete_research_project_price: l.complete_research_project_price,
            deposit_percentage: depositPercentage,
          })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to save");
      setSaved(true);
      setTimeout(() => setSaved(false), 3500);
      toast({ title: "Pricing saved", description: "All level pricing has been updated." });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const updateLevel = (level: string, field: keyof LevelPricing, value: number) => {
    setLevels(prev => prev.map(l => l.level === level ? { ...l, [field]: value } : l));
  };

  return (
    <DashboardLayout>
      <Orbs />

      <motion.div variants={fadeUp} custom={0} initial="hidden" animate="show"
        className="mb-8 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-amber-400">Configuration</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">Pricing Management</h1>
          <p className="mt-1.5 text-muted-foreground">Set research prices per level of study. Changes apply to all new orders.</p>
        </div>
        <motion.button whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
          onClick={handleSave} disabled={saving || loading}
          className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-lg shadow-primary/25">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? "Saved!" : "Save All Pricing"}
        </motion.button>
      </motion.div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-4 border-amber-500/20" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-amber-500 animate-spin" />
          </div>
          <p className="text-muted-foreground text-sm">Loading pricing configuration…</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Global deposit % */}
          <motion.div variants={fadeUp} custom={1} initial="hidden" animate="show"
            className="bg-card/60 backdrop-blur-sm border border-border rounded-2xl shadow-lg ring-1 ring-border/50 p-6">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <Percent className="w-5 h-5 text-amber-400" />
              </div>
              <h2 className="font-bold text-foreground text-lg">Deposit Percentage (All Levels)</h2>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative w-40">
                <input type="number" min="0" max="100" value={depositPercentage}
                  onChange={e => setDepositPercentage(Number(e.target.value))}
                  className="w-full pr-10 pl-4 py-3 rounded-xl border-2 border-border bg-background text-foreground text-lg font-bold outline-none focus:border-primary transition-colors" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">%</span>
              </div>
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                <span>Students pay {depositPercentage}% upfront as deposit, then the remaining {100 - depositPercentage}% after work is done.</span>
              </div>
            </div>
          </motion.div>

          {/* Per-level pricing table */}
          <motion.div variants={fadeUp} custom={2} initial="hidden" animate="show"
            className="bg-card/60 backdrop-blur-sm border border-border rounded-2xl shadow-lg ring-1 ring-border/50 overflow-hidden">
            <div className="px-6 py-5 border-b border-border/60 bg-gradient-to-r from-muted/40 to-transparent flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <Tag className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h2 className="font-bold text-foreground text-lg">Prices per Level of Study</h2>
                <p className="text-xs text-muted-foreground mt-0.5">All prices in KES</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/30 text-muted-foreground text-[11px] uppercase tracking-wider">
                    <th className="px-5 py-3.5 text-left font-semibold">Level</th>
                    <th className="px-5 py-3.5 text-left font-semibold">
                      <div>Research Proposal</div>
                      <div className="text-[10px] font-normal text-muted-foreground/70 normal-case tracking-normal">Chapter 1–3</div>
                    </th>
                    <th className="px-5 py-3.5 text-left font-semibold">
                      <div>Research Dissertation</div>
                      <div className="text-[10px] font-normal text-muted-foreground/70 normal-case tracking-normal">Chapter 4–5</div>
                    </th>
                    <th className="px-5 py-3.5 text-left font-semibold">
                      <div>Complete Project</div>
                      <div className="text-[10px] font-normal text-muted-foreground/70 normal-case tracking-normal">Chapter 1–5</div>
                    </th>
                    <th className="px-5 py-3.5 text-left font-semibold">Deposit / Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {levels.map(l => {
                    const propDeposit = (l.research_proposal_price * depositPercentage) / 100;
                    const dissDeposit = (l.research_dissertation_price * depositPercentage) / 100;
                    const compDeposit = (l.complete_research_project_price * depositPercentage) / 100;
                    return (
                      <tr key={l.level} className="hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-4">
                          <div className="font-semibold text-foreground">{l.level}</div>
                        </td>
                        <td className="px-5 py-4">
                          <PriceInput
                            value={l.research_proposal_price}
                            onChange={v => updateLevel(l.level, "research_proposal_price", v)}
                          />
                        </td>
                        <td className="px-5 py-4">
                          <PriceInput
                            value={l.research_dissertation_price}
                            onChange={v => updateLevel(l.level, "research_dissertation_price", v)}
                          />
                        </td>
                        <td className="px-5 py-4">
                          <PriceInput
                            value={l.complete_research_project_price}
                            onChange={v => updateLevel(l.level, "complete_research_project_price", v)}
                          />
                        </td>
                        <td className="px-5 py-4 space-y-1">
                          <div className="text-xs text-muted-foreground">
                            Proposal: <span className="text-foreground font-semibold">{formatCurrency(propDeposit)}</span>
                            {" / "}<span className="text-foreground font-semibold">{formatCurrency(l.research_proposal_price - propDeposit)}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Diss: <span className="text-foreground font-semibold">{formatCurrency(dissDeposit)}</span>
                            {" / "}<span className="text-foreground font-semibold">{formatCurrency(l.research_dissertation_price - dissDeposit)}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Complete: <span className="text-foreground font-semibold">{formatCurrency(compDeposit)}</span>
                            {" / "}<span className="text-foreground font-semibold">{formatCurrency(l.complete_research_project_price - compDeposit)}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        </div>
      )}
    </DashboardLayout>
  );
}

function PriceInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="relative w-32">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-medium">KES</span>
      <input
        type="number" min="0" value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm font-bold outline-none focus:border-primary transition-colors"
      />
    </div>
  );
}
