import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/use-auth";
import { useCreateOrder, useInitializePayment } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, ArrowRight, ArrowLeft, CheckCircle2,
  AlertCircle, CreditCard, ExternalLink, GraduationCap,
  BookOpen, Sparkles, Zap, Shield, Clock, Plus, Trash2,
  Upload, FileText, AlertTriangle, X, Info
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

const orderSchema = z.object({
  department: z.string().min(2, "Department is required"),
  courseName: z.string().min(2, "Course name is required"),
  levelOfStudy: z.string().min(2, "Level of study is required"),
  serviceType: z.string().min(2, "Service type is required"),
  researchTopic: z.string().min(5, "Topic is required").optional().or(z.literal("")),
  researchObjectives: z.string().optional(),
  additionalInstructions: z.string().optional(),
  paymentOption: z.enum(["deposit", "full"]).default("deposit"),
});

type OrderFormData = z.infer<typeof orderSchema>;

const LEVELS = ["Diploma", "Higher Diploma", "Upgrading", "Undergraduate", "Masters", "PhD"];
const SERVICES = ["Research Proposal", "Research Dissertation", "Complete Research Project"];

const SERVICE_INFO: Record<string, { short: string; badge: string; badgeColor: string; description: string }> = {
  "Research Proposal": {
    short: "Chapter 1–3",
    badge: "For new research",
    badgeColor: "bg-violet-500/15 text-violet-400 border-violet-500/30",
    description: "Chapters 1 to 3 — Introduction, Literature Review, and Research Methodology. Ideal for students starting out and need an approved proposal before data collection.",
  },
  "Research Dissertation": {
    short: "Chapter 4–5",
    badge: "Has approved proposal",
    badgeColor: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    description: "Chapters 4 to 5 — Results/Findings and Discussion/Conclusions. For students with an approved proposal who have collected data and need the final write-up.",
  },
  "Complete Research Project": {
    short: "Chapter 1–5",
    badge: "Full project",
    badgeColor: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    description: "Full research from start to finish — Chapters 1 through 5 including formatting, references, and final compilation. For students who need everything done.",
  },
};

const KMTC_DEPARTMENTS = [
  "Clinical Medicine","Nursing","Medical Engineering","Health Sciences","Pharmacy",
  "Community Health","Medical Laboratory Sciences","Physiotherapy","Occupational Therapy",
  "Radiography","Nutrition & Dietetics","Orthopaedic Technology","Ophthalmic Sciences",
  "Dental Technology","Health Records & Information Management","Nutrition & Food Science",
  "Environmental Health","Medical Social Work","Prosthetics & Orthotics","Medical Imaging Sciences",
];

const DEPARTMENT_SUGGESTIONS: Record<string, string[]> = {
  "Diploma": KMTC_DEPARTMENTS,"Higher Diploma": KMTC_DEPARTMENTS,
  "Upgrading": KMTC_DEPARTMENTS,
  "Undergraduate": ["Business Administration","Computing & Informatics","Education (Arts)",
    "Education (Science)","Engineering","Science","Arts & Social Sciences","Medicine & Surgery",
    "Law","Agriculture","Nursing","Public Health","Pharmacy"],
};
const DEFAULT_DEPARTMENTS = ["Business Administration","Computing & Informatics","Health Sciences","Education","Engineering","Medicine","Nursing","Arts"];

const KMTC_COURSES = [
  "Occupational Therapy","Clinical Medicine","Nursing","Medical Engineering","Community Health",
  "Pharmacy","Medical Laboratory Sciences","Physiotherapy","Radiography","Nutrition & Dietetics",
  "Orthopaedic Technology","Ophthalmic Sciences","Dental Technology","Health Records & Information Management",
  "Prosthetics & Orthotics","Medical Imaging Sciences","Environmental Health","Medical Social Work",
  "Nutrition & Food Science","Anaesthesia","Ear, Nose & Throat (ENT) Technology",
  "Perioperative Nursing","Psychiatric & Mental Health Nursing","Paediatric Nursing","Midwifery",
  "Renal Dialysis Technology","Cardiovascular Perfusion","Pharmaceutical Technology",
];

const COURSE_SUGGESTIONS: Record<string, string[]> = {
  "Diploma": KMTC_COURSES,"Higher Diploma": ["Clinical Medicine (Specialization)","Nursing Administration","Health Services Management","Medical Laboratory Sciences","Public Health"],
  "Upgrading": ["Upgrading to Diploma – Clinical Medicine","Upgrading to Diploma – Nursing","Upgrading to Diploma – Medical Laboratory","Upgrading to Higher Diploma"],
  "Undergraduate": ["Bachelor of Commerce","Bachelor of Education (Arts)","Bachelor of Education (Science)",
    "Bachelor of Science in Nursing","Bachelor of Science in Computer Science","Bachelor of Engineering",
    "Bachelor of Science","Bachelor of Business Administration","Bachelor of Laws (LLB)","Bachelor of Medicine & Surgery (MBChB)"],
  "Masters": ["Master of Business Administration (MBA)","Master of Public Health (MPH)","Master of Education","Master of Science","Master of Arts","Master of Engineering","Master of Laws (LLM)"],
  "PhD": ["Doctor of Philosophy – Health Sciences","Doctor of Philosophy – Education","Doctor of Philosophy – Business","Doctor of Philosophy – Science","Doctor of Philosophy – Engineering"],
};

type LevelPricing = {
  level: string;
  researchProposalPrice: number;
  researchDissertationPrice: number;
  completeResearchProjectPrice: number;
  depositPercentage: number;
};
type CreatedOrder = { id: string; orderId: string; depositAmount: number; totalAmount: number };

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

const STEP_META = [
  { label: "Academic Info", icon: GraduationCap, desc: "Your study level & department" },
  { label: "Project Details", icon: BookOpen, desc: "Research topic & objectives" },
  { label: "Review & Pay", icon: CreditCard, desc: "Confirm and proceed" },
];

export default function NewOrder() {
  const [step, setStep] = useState(1);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [submitError, setSubmitError] = useState("");
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null);
  const [deptSuggOpen, setDeptSuggOpen] = useState(false);
  const [courseSuggOpen, setCourseSuggOpen] = useState(false);

  const [objectives, setObjectives] = useState(["", "", ""]);
  const [objectivesError, setObjectivesError] = useState("");

  const [proposalFile, setProposalFile] = useState<File | null>(null);
  const [proposalUploading, setProposalUploading] = useState(false);
  const [proposalUrl, setProposalUrl] = useState("");
  const [proposalFileName, setProposalFileName] = useState("");
  const [proposalError, setProposalError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dissertationSource, setDissertationSource] = useState<"own" | "sasyna">("own");
  const [referenceOrderId, setReferenceOrderId] = useState("");
  const [referenceOrderIdError, setReferenceOrderIdError] = useState("");
  const [selectedProposalOrder, setSelectedProposalOrder] = useState<{ id: string; orderId: string; researchTopic: string; status: string; createdAt: string } | null>(null);
  const [useOtherAccount, setUseOtherAccount] = useState(false);

  const { register, handleSubmit, trigger, watch, setValue, formState: { errors } } = useForm<OrderFormData>({
    resolver: zodResolver(orderSchema),
    defaultValues: { levelOfStudy: "Diploma", serviceType: SERVICES[0], paymentOption: "deposit" }
  });

  const watchedLevel = watch("levelOfStudy");
  const watchedServiceType = watch("serviceType");
  const watchedPaymentOption = watch("paymentOption");
  const watchedDept = watch("department");
  const watchedCourse = watch("courseName");

  const isDissertation = watchedServiceType === "Research Dissertation";

  const { data: levelPricing, isLoading: pricingLoading } = useQuery<LevelPricing>({
    queryKey: ["/api/pricing/level", watchedLevel],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/pricing?level=${encodeURIComponent(watchedLevel)}`, { headers });
      if (!res.ok) return { level: watchedLevel, researchProposalPrice: 1500, researchDissertationPrice: 1500, completeResearchProjectPrice: 2500, depositPercentage: 50 };
      return res.json();
    },
    enabled: !!watchedLevel,
  });

  const { data: myProposalOrders = [], isLoading: loadingProposals } = useQuery<{ id: string; orderId: string; researchTopic: string; status: string; createdAt: string }[]>({
    queryKey: ["my-proposal-orders", user?.id],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/orders", { headers });
      if (!res.ok) return [];
      const all = await res.json();
      return (all as { id: string; orderId: string; researchTopic: string; status: string; createdAt: string; serviceType: string }[])
        .filter(o => o.serviceType === "Research Proposal" && o.status === "ready_for_download");
    },
    enabled: !!user?.id && isDissertation && dissertationSource === "sasyna",
  });

  const { mutateAsync: createOrder, isPending } = useCreateOrder();
  const { mutate: initPayment, isPending: isPaying } = useInitializePayment();

  const getPrice = (serviceType: string): number => {
    if (!levelPricing) return 0;
    if (serviceType === "Research Proposal") return levelPricing.researchProposalPrice || 0;
    if (serviceType === "Research Dissertation") return levelPricing.researchDissertationPrice || 0;
    if (serviceType === "Complete Research Project") return levelPricing.completeResearchProjectPrice || 0;
    return 0;
  };

  const totalAmount = getPrice(watchedServiceType);
  const depositPct = levelPricing?.depositPercentage || 50;
  const depositAmount = totalAmount * (depositPct / 100);
  const balanceAmount = totalAmount - depositAmount;

  const currentDeptSuggestions = DEPARTMENT_SUGGESTIONS[watchedLevel] || DEFAULT_DEPARTMENTS;
  const currentCourseSuggestions = COURSE_SUGGESTIONS[watchedLevel] || [];

  const addObjective = () => setObjectives(prev => [...prev, ""]);
  const removeObjective = (idx: number) => {
    if (objectives.length <= 3) return;
    setObjectives(prev => prev.filter((_, i) => i !== idx));
  };
  const updateObjective = (idx: number, val: string) => {
    setObjectives(prev => prev.map((o, i) => i === idx ? val : o));
  };

  const validateObjectives = (): boolean => {
    const filled = objectives.filter(o => o.trim().length > 0);
    if (filled.length < 3) {
      setObjectivesError("Please fill at least 3 research objectives as approved by your supervisor.");
      return false;
    }
    setObjectivesError("");
    return true;
  };

  const handleProposalUpload = async (file: File) => {
    setProposalError("");
    setProposalUploading(true);
    try {
      const headers = await getAuthHeaders();
      const urlRes = await fetch("/api/orders/proposal-upload-url", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { signedUrl, path } = await urlRes.json();

      const uploadRes = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Upload failed. Please try again.");

      setProposalUrl(path);
      setProposalFileName(file.name);
      setProposalFile(file);
    } catch (err) {
      setProposalError(err instanceof Error ? err.message : "Upload failed. Please try again.");
      setProposalFile(null);
      setProposalUrl("");
    } finally {
      setProposalUploading(false);
    }
  };

  const nextStep = async () => {
    let fields: (keyof OrderFormData)[] = [];
    if (step === 1) fields = ["department", "courseName", "levelOfStudy"];
    if (step === 2) {
      fields = ["serviceType"];
      if (!isDissertation) {
        fields.push("researchTopic" as keyof OrderFormData);
        const objValid = validateObjectives();
        if (!objValid) return;
      }
      if (isDissertation) {
        if (dissertationSource === "sasyna") {
          const hasSelection = !!selectedProposalOrder;
          const hasManual = useOtherAccount && referenceOrderId.trim().length > 0;
          if (!hasSelection && !hasManual) {
            setReferenceOrderIdError(
              useOtherAccount
                ? "Please enter the Order ID from your other account."
                : "Please select a proposal order or enter one manually."
            );
            return;
          }
        }
        if (!proposalUrl) {
          setProposalError("Please upload your approved research proposal before continuing.");
          return;
        }
      }
    }
    if (await trigger(fields)) setStep(s => s + 1);
  };

  const onSubmit = async (data: OrderFormData) => {
    setSubmitError("");

    let objectivesText = "";
    let topicText = data.researchTopic || "";

    if (isDissertation) {
      topicText = "Research Dissertation — See uploaded proposal";
      const finalRefId = dissertationSource === "sasyna"
        ? (selectedProposalOrder?.orderId || (useOtherAccount ? referenceOrderId.trim() : ""))
        : "";
      objectivesText = dissertationSource === "sasyna" && finalRefId
        ? `Referenced Proposal Order: ${finalRefId}\nResearch objectives are as per the uploaded approved proposal.`
        : "Research objectives are as per the uploaded approved proposal.";
    } else {
      objectivesText = objectives
        .map((o, i) => `${i + 1}. ${o.trim()}`)
        .filter(o => o.length > 3)
        .join("\n");
    }

    try {
      const price = getPrice(data.serviceType);
      const dep = price * (depositPct / 100);
      const order = await createOrder({
        data: {
          ...data,
          researchTopic: topicText,
          researchObjectives: objectivesText,
          uploadedFileUrl: proposalUrl || undefined,
          uploadedFileName: proposalFileName || undefined,
          studentId: user?.id || "",
          studentName: user?.user_metadata?.full_name || user?.user_metadata?.name,
          studentEmail: user?.email,
          totalAmount: price,
          depositAmount: dep,
          paymentOption: data.paymentOption,
        }
      });
      setCreatedOrder({ id: order.id, orderId: order.orderId || "", depositAmount: dep, totalAmount: price });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to create order. Please try again.");
    }
  };

  const handlePayNow = (type: "deposit" | "full") => {
    if (!createdOrder) return;
    const amount = type === "deposit" ? createdOrder.depositAmount : createdOrder.totalAmount;
    initPayment({ data: { orderId: createdOrder.orderId || createdOrder.id, email: user?.email || "", amount, paymentType: type === "full" ? "deposit" : type } }, {
      onSuccess: (res: { authorizationUrl: string }) => { window.location.href = res.authorizationUrl; },
      onError: () => { setSubmitError("Payment initialization failed. Go to your order to retry payment."); }
    });
  };

  if (createdOrder) {
    const bal = createdOrder.totalAmount - createdOrder.depositAmount;
    return (
      <DashboardLayout>
        <Orbs />
        <div className="max-w-lg mx-auto">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: EASE }}>
            <div className="text-center mb-8">
              <div className="relative inline-flex items-center justify-center mb-5">
                <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-xl shadow-emerald-500/30">
                  <CheckCircle2 className="w-10 h-10 text-white" />
                </div>
              </div>
              <h1 className="text-3xl font-extrabold text-foreground">Order Created!</h1>
              <p className="mt-2 text-muted-foreground">
                Order <span className="font-mono font-bold text-violet-400">{createdOrder.orderId || createdOrder.id}</span> is ready. Choose how to pay.
              </p>
            </div>

            <div className="bg-card/70 backdrop-blur-sm border border-border rounded-3xl p-6 shadow-xl ring-1 ring-border/50 space-y-6">
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: "Total", val: createdOrder.totalAmount, color: "text-foreground", bg: "bg-muted/40" },
                  { label: `Deposit (${depositPct}%)`, val: createdOrder.depositAmount, color: "text-amber-400", bg: "bg-amber-500/10 ring-1 ring-amber-500/20" },
                  { label: "Balance", val: bal, color: "text-sky-400", bg: "bg-sky-500/10 ring-1 ring-sky-500/20" },
                ].map(item => (
                  <div key={item.label} className={`rounded-2xl p-3 ${item.bg}`}>
                    <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">{item.label}</div>
                    <div className={`font-black text-base ${item.color}`}>{formatCurrency(item.val)}</div>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Select payment option</p>
                <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}
                  onClick={() => handlePayNow("deposit")} disabled={isPaying}
                  className="w-full flex items-center justify-between px-5 py-4 rounded-2xl text-white font-semibold shadow-lg shadow-violet-500/25 disabled:opacity-60 transition-all"
                  style={{ background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)" }}>
                  <div className="text-left">
                    <div className="font-bold">Pay Deposit Now</div>
                    <div className="text-xs opacity-75 mt-0.5">Pay {depositPct}% to start · balance due after delivery</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isPaying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                    <span className="font-black text-lg">{formatCurrency(createdOrder.depositAmount)}</span>
                  </div>
                </motion.button>

                <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}
                  onClick={() => handlePayNow("full")} disabled={isPaying}
                  className="w-full flex items-center justify-between px-5 py-4 rounded-2xl bg-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/25 hover:bg-emerald-700 disabled:opacity-60 transition-all">
                  <div className="text-left">
                    <div className="font-bold">Pay Full Amount</div>
                    <div className="text-xs opacity-75 mt-0.5">Pay everything now · instant download on completion</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isPaying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    <span className="font-black text-lg">{formatCurrency(createdOrder.totalAmount)}</span>
                  </div>
                </motion.button>
              </div>

              {submitError && (
                <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-sm text-destructive">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-border/50">
                <button onClick={() => setLocation(`/student/orders/${createdOrder.id}`)}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" /> View order & pay later
                </button>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Shield className="w-3 h-3" /> Secure payment
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Orbs />
      <div className="max-w-2xl mx-auto">

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <span className="text-xs font-bold uppercase tracking-widest text-violet-400">New Research Order</span>
          </div>
          <h1 className="text-3xl font-extrabold text-foreground">Place New Order</h1>
          <p className="mt-1 text-muted-foreground">Expert research delivered within 48 hours.</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08, ease: EASE }}
          className="flex items-center mb-8 gap-0">
          {STEP_META.map((s, i) => {
            const num = i + 1;
            const done = step > num;
            const active = step === num;
            return (
              <div key={s.label} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1.5">
                  <div className={cn(
                    "w-10 h-10 rounded-2xl flex items-center justify-center font-bold border-2 transition-all duration-300 shadow-sm",
                    done ? "bg-violet-600 border-violet-600 text-white shadow-violet-500/30" :
                    active ? "border-violet-500 text-violet-400 bg-violet-500/10 shadow-violet-500/20" :
                    "border-border bg-card text-muted-foreground"
                  )}>
                    {done ? <CheckCircle2 className="w-5 h-5" /> : <s.icon className="w-4 h-4" />}
                  </div>
                  <span className={cn("text-[11px] font-semibold hidden sm:block text-center leading-tight max-w-[72px]",
                    active ? "text-foreground" : done ? "text-violet-400" : "text-muted-foreground")}>
                    {s.label}
                  </span>
                </div>
                {i < STEP_META.length - 1 && (
                  <div className="flex-1 h-0.5 mx-2 mb-5 sm:mb-6 rounded-full bg-border overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all duration-500 ease-out",
                      step > num ? "bg-violet-500 w-full" : "w-0")} />
                  </div>
                )}
              </div>
            );
          })}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.16, ease: EASE }}
          className="relative bg-card/70 backdrop-blur-sm border border-border rounded-3xl shadow-xl ring-1 ring-border/50 overflow-hidden">

          <AnimatePresence>
            {isPending && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-background/80 backdrop-blur-sm rounded-3xl z-50 flex flex-col items-center justify-center gap-4">
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 rounded-full border-4 border-violet-500/20" />
                  <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-violet-500 animate-spin" />
                  <div className="absolute inset-3 rounded-full bg-violet-500/10 flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-violet-400" />
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-foreground">Creating your order…</div>
                  <div className="text-sm text-muted-foreground mt-1">Please wait, don't close this page</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit(onSubmit)}>
            <AnimatePresence mode="wait">

              {/* ─── STEP 1: Academic Info ─── */}
              {step === 1 && (
                <motion.div key="step1" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.3, ease: EASE }} className="p-6 sm:p-8 space-y-5">
                  <StepHeader icon={GraduationCap} title="Academic Information" desc="Tell us about your study level and programme" />

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground">Level of Study <span className="text-destructive">*</span></label>
                    <select {...register("levelOfStudy")}
                      className="w-full p-3.5 rounded-xl bg-background border-2 border-border focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 outline-none transition-all appearance-none cursor-pointer text-foreground">
                      {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>

                  <SuggestionField
                    label="Department / School"
                    reg={register("department")}
                    error={errors.department?.message}
                    open={deptSuggOpen}
                    onFocus={() => setDeptSuggOpen(true)}
                    onBlur={() => setTimeout(() => setDeptSuggOpen(false), 150)}
                    suggestions={currentDeptSuggestions.filter(s => !watchedDept || s.toLowerCase().includes(watchedDept.toLowerCase())).slice(0, 8)}
                    onSelect={(s) => { setValue("department", s); setDeptSuggOpen(false); }}
                    placeholder={currentDeptSuggestions[0] ? `e.g. ${currentDeptSuggestions[0]}` : "e.g. School of Health Sciences"}
                  />

                  <SuggestionField
                    label="Course / Programme Name"
                    reg={register("courseName")}
                    error={errors.courseName?.message}
                    open={courseSuggOpen}
                    onFocus={() => setCourseSuggOpen(true)}
                    onBlur={() => setTimeout(() => setCourseSuggOpen(false), 150)}
                    suggestions={currentCourseSuggestions.filter(s => !watchedCourse || s.toLowerCase().includes(watchedCourse.toLowerCase())).slice(0, 8)}
                    onSelect={(s) => { setValue("courseName", s); setCourseSuggOpen(false); }}
                    placeholder={currentCourseSuggestions[0] ? `e.g. ${currentCourseSuggestions[0]}` : "e.g. Clinical Medicine"}
                  />
                </motion.div>
              )}

              {/* ─── STEP 2: Project Details ─── */}
              {step === 2 && (
                <motion.div key="step2" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.3, ease: EASE }} className="p-6 sm:p-8 space-y-6">
                  <StepHeader icon={BookOpen} title="Project Details" desc="Select your service and describe your research" />

                  {/* Service type selection */}
                  <div className="space-y-3">
                    <label className="text-sm font-semibold text-foreground">Service Type <span className="text-destructive">*</span></label>
                    <div className="space-y-2.5">
                      {SERVICES.map(s => {
                        const info = SERVICE_INFO[s];
                        const selected = watchedServiceType === s;
                        return (
                          <label key={s} className={cn(
                            "flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all",
                            selected ? "border-violet-500 bg-violet-500/8" : "border-border bg-background hover:border-violet-500/40"
                          )}>
                            <input type="radio" value={s} {...register("serviceType")} className="sr-only" />
                            <div className={cn("w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 transition-all",
                              selected ? "border-violet-500 bg-violet-500" : "border-muted-foreground")} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                <span className={cn("font-bold text-sm", selected ? "text-violet-400" : "text-foreground")}>{s}</span>
                                <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", info.badgeColor)}>{info.short}</span>
                                <span className={cn("text-[10px] px-2 py-0.5 rounded-full border", info.badgeColor)}>{info.badge}</span>
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed">{info.description}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Pricing */}
                  {levelPricing && !pricingLoading && totalAmount > 0 && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      className="grid grid-cols-3 gap-2 text-center text-sm">
                      {[
                        { label: "Total", val: totalAmount, cls: "bg-muted/40 text-foreground" },
                        { label: `Deposit ${depositPct}%`, val: depositAmount, cls: "bg-amber-500/10 ring-1 ring-amber-500/20 text-amber-400" },
                        { label: "Balance", val: balanceAmount, cls: "bg-sky-500/10 ring-1 ring-sky-500/20 text-sky-400" },
                      ].map(x => (
                        <div key={x.label} className={`rounded-xl p-2.5 ${x.cls}`}>
                          <div className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wider">{x.label}</div>
                          <div className="font-bold text-sm">{formatCurrency(x.val)}</div>
                        </div>
                      ))}
                    </motion.div>
                  )}

                  {/* Research Dissertation: proposal source + upload */}
                  {isDissertation ? (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

                      {/* Info banner */}
                      <div className="flex items-start gap-3 p-4 bg-sky-500/8 border border-sky-500/25 rounded-xl">
                        <Info className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
                        <div className="text-xs text-sky-300 leading-relaxed">
                          <strong className="text-sky-400 block mb-0.5">Research Dissertation — Chapters 4 &amp; 5</strong>
                          Our researcher needs your approved proposal to align the findings and discussion chapters with your approved work. Choose how your proposal was created.
                        </div>
                      </div>

                      {/* Proposal source toggle */}
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-foreground">Where is your approved proposal from? <span className="text-destructive">*</span></label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { val: "own" as const, label: "I have my own proposal", desc: "You obtained the proposal externally or wrote it yourself" },
                            { val: "sasyna" as const, label: "Sasyna created it for me", desc: "We wrote your proposal — enter the order ID below" },
                          ].map(opt => (
                            <button
                              key={opt.val}
                              type="button"
                              onClick={() => { setDissertationSource(opt.val); setReferenceOrderIdError(""); }}
                              className={cn(
                                "flex flex-col gap-1 p-3.5 rounded-xl border-2 text-left transition-all",
                                dissertationSource === opt.val
                                  ? "border-sky-500 bg-sky-500/10"
                                  : "border-border bg-background hover:border-sky-500/40"
                              )}>
                              <div className={cn("w-3.5 h-3.5 rounded-full border-2 mb-1 shrink-0 transition-all",
                                dissertationSource === opt.val ? "border-sky-500 bg-sky-500" : "border-muted-foreground")} />
                              <span className={cn("text-xs font-bold", dissertationSource === opt.val ? "text-sky-400" : "text-foreground")}>{opt.label}</span>
                              <span className="text-[10px] text-muted-foreground leading-relaxed">{opt.desc}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Proposal selection (only shown when Sasyna created it) */}
                      <AnimatePresence>
                        {dissertationSource === "sasyna" && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-3 overflow-hidden">
                            <label className="text-sm font-semibold text-foreground">Select Your Proposal Order <span className="text-destructive">*</span></label>

                            {/* Own proposals list */}
                            {loadingProposals ? (
                              <div className="flex items-center gap-2 p-3.5 rounded-xl bg-sky-500/5 border border-sky-500/20 text-sm text-muted-foreground">
                                <Loader2 className="w-4 h-4 animate-spin text-sky-400" /> Loading your proposal orders…
                              </div>
                            ) : myProposalOrders.length === 0 ? (
                              <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-muted/30 border border-border text-sm text-muted-foreground">
                                <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                                <span>No completed proposal orders (ready for download) found on this account. Use the manual entry below.</span>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {myProposalOrders.map(order => {
                                  const isSelected = selectedProposalOrder?.id === order.id;
                                  return (
                                    <button
                                      key={order.id}
                                      type="button"
                                      onClick={() => {
                                        setSelectedProposalOrder(isSelected ? null : order);
                                        setUseOtherAccount(false);
                                        setReferenceOrderIdError("");
                                      }}
                                      className={cn(
                                        "w-full flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition-all",
                                        isSelected
                                          ? "border-sky-500 bg-sky-500/10"
                                          : "border-border bg-background hover:border-sky-500/40"
                                      )}
                                    >
                                      <div className={cn(
                                        "w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 transition-all",
                                        isSelected ? "border-sky-500 bg-sky-500" : "border-muted-foreground"
                                      )} />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                          <span className={cn("font-mono text-xs font-bold", isSelected ? "text-sky-400" : "text-foreground")}>
                                            {order.orderId || order.id}
                                          </span>
                                          <span className={cn(
                                            "text-[10px] px-1.5 py-0.5 rounded-full border font-semibold capitalize",
                                            order.status === "completed" || order.status === "ready_for_download"
                                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                              : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                          )}>
                                            {(order.status || "").replace(/_/g, " ")}
                                          </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground truncate max-w-xs">
                                          {order.researchTopic || "Research Proposal"}
                                        </p>
                                      </div>
                                      {isSelected && (
                                        <div className="shrink-0">
                                          <CheckCircle2 className="w-4 h-4 text-sky-400" />
                                        </div>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {/* Other account toggle */}
                            <button
                              type="button"
                              onClick={() => {
                                setUseOtherAccount(v => !v);
                                setSelectedProposalOrder(null);
                                setReferenceOrderIdError("");
                              }}
                              className={cn(
                                "w-full flex items-center gap-2.5 p-3 rounded-xl border text-left text-xs transition-all",
                                useOtherAccount
                                  ? "border-violet-500/50 bg-violet-500/8 text-violet-400"
                                  : "border-dashed border-border text-muted-foreground hover:border-violet-500/30 hover:text-foreground"
                              )}
                            >
                              <div className={cn(
                                "w-3.5 h-3.5 rounded-full border-2 shrink-0 transition-all",
                                useOtherAccount ? "border-violet-500 bg-violet-500" : "border-muted-foreground"
                              )} />
                              <span className="font-medium">My proposal was created under a different Sasyna account</span>
                            </button>

                            {/* Manual order ID input (cross-account) */}
                            <AnimatePresence>
                              {useOtherAccount && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                                  <div className="flex items-center gap-2 p-3.5 rounded-xl bg-background border-2 border-violet-500/40 focus-within:border-violet-500 focus-within:ring-4 focus-within:ring-violet-500/10 transition-all">
                                    <FileText className="w-4 h-4 text-violet-400 shrink-0" />
                                    <input
                                      value={referenceOrderId}
                                      onChange={e => { setReferenceOrderId(e.target.value.toUpperCase()); setReferenceOrderIdError(""); }}
                                      className="flex-1 bg-transparent outline-none text-foreground font-mono text-sm placeholder:text-muted-foreground"
                                      placeholder="e.g. SAS-419XXXXXXXX"
                                    />
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1.5">Enter the Order ID from your other Sasyna account (starts with SAS-419…).</p>
                                </motion.div>
                              )}
                            </AnimatePresence>

                            {referenceOrderIdError && (
                              <p className="text-destructive text-xs flex items-center gap-1.5">
                                <AlertCircle className="w-3 h-3 shrink-0" /> {referenceOrderIdError}
                              </p>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Upload section — always required */}
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-foreground">
                          Upload Approved Research Proposal <span className="text-destructive">*</span>
                        </label>
                        <p className="text-xs text-muted-foreground">
                          {dissertationSource === "sasyna"
                            ? "Upload the proposal file (the one we created for you, downloaded from your previous order)."
                            : "Upload your approved proposal — our researcher will use it to write Chapters 4 and 5."}
                        </p>
                        {!proposalUrl ? (
                          <div
                            onClick={() => fileInputRef.current?.click()}
                            className={cn(
                              "flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed cursor-pointer transition-all",
                              proposalError ? "border-destructive/60 bg-destructive/5" : "border-border hover:border-violet-500/50 hover:bg-violet-500/5"
                            )}>
                            {proposalUploading ? (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
                                Uploading proposal…
                              </div>
                            ) : (
                              <>
                                <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                                <p className="text-sm font-medium text-foreground">Click to upload proposal</p>
                                <p className="text-xs text-muted-foreground mt-1">PDF or Word document (max 20MB)</p>
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4 text-emerald-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-emerald-400 truncate">{proposalFileName}</p>
                              <p className="text-xs text-muted-foreground">Uploaded successfully</p>
                            </div>
                            <button type="button" onClick={() => { setProposalUrl(""); setProposalFile(null); setProposalFileName(""); }}
                              className="p-1.5 rounded-lg hover:bg-emerald-500/20 text-emerald-400 transition-colors">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.doc,.docx"
                          className="hidden"
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) handleProposalUpload(f);
                          }}
                        />
                        {proposalError && (
                          <p className="text-destructive text-xs flex items-center gap-1.5">
                            <AlertCircle className="w-3 h-3 shrink-0" /> {proposalError}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-foreground">Additional Instructions <span className="text-muted-foreground font-normal">(optional)</span></label>
                        <textarea {...register("additionalInstructions")} rows={2}
                          className="w-full p-3.5 rounded-xl bg-background border-2 border-border focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 outline-none transition-all resize-none text-foreground"
                          placeholder="Any special requirements, formatting preferences…" />
                      </div>
                    </motion.div>
                  ) : (
                    <>
                      {/* Research Topic */}
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-foreground">Approved Research Topic <span className="text-destructive">*</span></label>
                        <input {...register("researchTopic")}
                          className="w-full p-3.5 rounded-xl bg-background border-2 border-border focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 outline-none transition-all text-foreground"
                          placeholder="e.g. Prevalence of osteoarthritis among patients attending Kenyatta National Hospital…" />
                        {errors.researchTopic && <p className="text-destructive text-xs">{errors.researchTopic.message}</p>}
                      </div>

                      {/* Research Objectives */}
                      <div className="space-y-3">
                        <div className="flex items-start gap-3 p-4 bg-amber-500/8 border border-amber-500/25 rounded-xl">
                          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                          <div className="text-xs text-amber-300 leading-relaxed">
                            <strong className="text-amber-400 block mb-0.5">Important — Use Supervisor-Approved Objectives</strong>
                            Enter your research objectives exactly as approved by your supervisor. These must be the official, approved objectives to ensure quality and alignment with your research.
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <label className="text-sm font-semibold text-foreground">
                            Research Objectives <span className="text-destructive">*</span>
                            <span className="ml-2 text-xs font-normal text-muted-foreground">(minimum 3)</span>
                          </label>
                        </div>

                        <div className="space-y-2.5">
                          {objectives.map((obj, idx) => (
                            <div key={idx} className="flex items-start gap-2">
                              <div className="w-7 h-7 rounded-lg bg-violet-500/15 text-violet-400 text-xs font-bold flex items-center justify-center shrink-0 mt-2.5">
                                {idx + 1}
                              </div>
                              <input
                                value={obj}
                                onChange={e => updateObjective(idx, e.target.value)}
                                className="flex-1 p-3 rounded-xl bg-background border-2 border-border focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 outline-none transition-all text-foreground text-sm"
                                placeholder={`Objective ${idx + 1}: e.g. To assess the prevalence of…`}
                              />
                              {objectives.length > 3 && (
                                <button type="button" onClick={() => removeObjective(idx)}
                                  className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors mt-2">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>

                        <button type="button" onClick={addObjective}
                          className="flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300 font-medium transition-colors">
                          <Plus className="w-4 h-4" /> Add another objective
                        </button>

                        {objectivesError && (
                          <p className="text-destructive text-xs flex items-center gap-1.5">
                            <AlertCircle className="w-3 h-3 shrink-0" /> {objectivesError}
                          </p>
                        )}
                      </div>

                      {/* Additional Instructions */}
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-foreground">Additional Instructions <span className="text-muted-foreground font-normal">(optional)</span></label>
                        <textarea {...register("additionalInstructions")} rows={2}
                          className="w-full p-3.5 rounded-xl bg-background border-2 border-border focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 outline-none transition-all resize-none text-foreground"
                          placeholder="Any special requirements, formatting preferences…" />
                      </div>
                    </>
                  )}
                </motion.div>
              )}

              {/* ─── STEP 3: Review & Pay ─── */}
              {step === 3 && (
                <motion.div key="step3" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.3, ease: EASE }} className="p-6 sm:p-8 space-y-5">
                  <StepHeader icon={CreditCard} title="Review & Submit" desc="Confirm your order details before proceeding" />

                  <ReviewRow label="Level of Study" value={watch("levelOfStudy")} />
                  <ReviewRow label="Department" value={watch("department")} />
                  <ReviewRow label="Course" value={watch("courseName")} />
                  <ReviewRow label="Service" value={watchedServiceType} />
                  {!isDissertation && watch("researchTopic") && (
                    <ReviewRow label="Research Topic" value={watch("researchTopic") || ""} />
                  )}
                  {isDissertation && dissertationSource === "sasyna" && selectedProposalOrder && (
                    <ReviewRow label="Referenced Proposal Order" value={selectedProposalOrder.orderId || selectedProposalOrder.id} />
                  )}
                  {isDissertation && dissertationSource === "sasyna" && useOtherAccount && referenceOrderId && (
                    <ReviewRow label="Referenced Proposal Order" value={referenceOrderId} />
                  )}
                  {isDissertation && proposalFileName && (
                    <ReviewRow label="Uploaded Proposal File" value={proposalFileName} />
                  )}

                  <div className="space-y-2 pt-2 border-t border-border/50">
                    <p className="text-sm font-semibold text-foreground">Payment Preference</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { val: "deposit", label: "Pay Deposit", sub: `${formatCurrency(depositAmount)} now`, icon: Clock },
                        { val: "full", label: "Pay in Full", sub: `${formatCurrency(totalAmount)} now`, icon: Zap },
                      ].map(opt => (
                        <label key={opt.val} className={cn(
                          "flex flex-col gap-1 p-3.5 rounded-xl border-2 cursor-pointer transition-all",
                          watchedPaymentOption === opt.val
                            ? "border-violet-500 bg-violet-500/10"
                            : "border-border hover:border-violet-500/40"
                        )}>
                          <input type="radio" value={opt.val} {...register("paymentOption")} className="sr-only" />
                          <div className="flex items-center gap-2">
                            <opt.icon className={cn("w-4 h-4", watchedPaymentOption === opt.val ? "text-violet-400" : "text-muted-foreground")} />
                            <span className={cn("text-sm font-semibold", watchedPaymentOption === opt.val ? "text-violet-400" : "text-foreground")}>{opt.label}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">{opt.sub}</span>
                        </label>
                      ))}
                    </div>
                    {/* Deposit notice */}
                    {watchedPaymentOption === "deposit" && (
                      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                        className="flex items-start gap-2.5 p-3.5 bg-amber-500/8 border border-amber-500/25 rounded-xl mt-2">
                        <Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-amber-300 leading-relaxed">
                          <strong className="text-amber-400">Note:</strong> By paying the deposit ({depositPct}%), you agree to pay the remaining balance of {formatCurrency(balanceAmount)} once your research is completed. Your work will only be released after full payment is confirmed.
                        </p>
                      </motion.div>
                    )}
                  </div>

                  {submitError && (
                    <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-sm text-destructive">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{submitError}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground pt-2">
                    <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> Secure</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 48hr Delivery</span>
                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Free Revisions</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* nav buttons */}
            <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-t border-border/50 bg-muted/20">
              <button type="button" onClick={() => step > 1 ? setStep(s => s - 1) : undefined}
                className={cn("flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all",
                  step > 1 ? "text-muted-foreground hover:text-foreground hover:bg-muted" : "invisible")}>
                <ArrowLeft className="w-4 h-4" /> Back
              </button>

              {step < 3 ? (
                <motion.button type="button" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={nextStep} disabled={proposalUploading}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-white text-sm shadow-lg shadow-violet-500/25 disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)" }}>
                  {proposalUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Continue <ArrowRight className="w-4 h-4" />
                </motion.button>
              ) : (
                <motion.button type="submit" disabled={isPending} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-white text-sm shadow-lg shadow-violet-500/25 disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)" }}>
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Place Order
                </motion.button>
              )}
            </div>
          </form>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}

function Orbs() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
      <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-violet-600/8 blur-[100px] animate-pulse" style={{ animationDuration: "6s" }} />
      <div className="absolute top-1/2 -right-40 w-[420px] h-[420px] rounded-full bg-sky-500/8 blur-[120px] animate-pulse" style={{ animationDuration: "8s", animationDelay: "2s" }} />
      <div className="absolute inset-0 opacity-[0.025]"
        style={{ backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
    </div>
  );
}

function StepHeader({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 pb-2 border-b border-border/50">
      <div className="w-10 h-10 rounded-2xl bg-violet-500/15 flex items-center justify-center">
        <Icon className="w-5 h-5 text-violet-400" />
      </div>
      <div>
        <div className="font-bold text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </div>
  );
}

function SuggestionField({ label, reg, error, open, onFocus, onBlur, suggestions, onSelect, placeholder }: {
  label: string; reg: object; error?: string; open: boolean; onFocus: () => void; onBlur: () => void;
  suggestions: string[]; onSelect: (s: string) => void; placeholder: string;
}) {
  return (
    <div className="space-y-2 relative">
      <label className="text-sm font-semibold text-foreground">{label} <span className="text-destructive">*</span></label>
      <input {...(reg as Record<string, unknown>)} onFocus={onFocus} onBlur={onBlur} autoComplete="off"
        className="w-full p-3.5 rounded-xl bg-background border-2 border-border focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 outline-none transition-all text-foreground"
        placeholder={placeholder} />
      <AnimatePresence>
        {open && suggestions.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
            className="absolute z-50 top-full left-0 right-0 bg-card border border-border rounded-xl shadow-xl max-h-48 overflow-y-auto mt-1">
            {suggestions.map(s => (
              <button key={s} type="button"
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-violet-500/10 hover:text-violet-400 transition-colors first:rounded-t-xl last:rounded-b-xl text-foreground"
                onMouseDown={() => onSelect(s)}>{s}</button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-semibold text-foreground text-right">{value}</span>
    </div>
  );
}
