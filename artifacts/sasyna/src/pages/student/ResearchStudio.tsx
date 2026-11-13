import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  FilePlus2,
  FileText,
  LoaderCircle,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { createResearchProposalDocument, downloadProposalDocument } from "@/lib/exportResearchProposal";
import type { StudyAreaPoint } from "@/lib/study-map";

type ProjectStatus = "draft" | "queued" | "generating" | "ready" | "failed";

type ResearchSection = {
  id: string;
  heading: string;
  content: string;
  citationIds?: string[];
};

type BudgetItem = {
  item: string;
  quantity: number;
  unitCost: number;
};

type ResearchReference = {
  id: string;
  title: string;
  authors: Array<{
    lastName: string;
    initials?: string;
    firstName?: string;
  }>;
  year: number;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  pmid?: string;
  pmcid?: string;
  abstract?: string;
  sourceUrl?: string;
  source?: "Europe PMC" | "Crossref" | "AI-generated";
};

type ResearchProject = {
  id: string;
  title: string;
  studentName: string;
  admissionNumber: string;
  course: string;
  department: string;
  studyLocation: string;
  supervisorName: string;
  studyDesign: string;
  targetPopulation: string;
  studyPeriodStart: string;
  studyPeriodEnd: string;
  targetPages: number;
  researchQuestions: string | string[];
  broadObjective: string;
  specificObjectives: string | string[];
  confidenceLevel: 90 | 95 | 99;
  proportionEstimate: number;
  marginOfError: number;
  populationSize: number | null;
  nonresponseRate: number;
  workPlanStartDate: string;
  workPlanDurationMonths: number;
  budgetItems: BudgetItem[];
  mapPoint: StudyAreaPoint | null;
  references: ResearchReference[];
  sections: ResearchSection[];
  status: ProjectStatus;
  completedSections: number;
  totalSections: number;
  currentSection: string | null;
  generationError: string | null;
  updatedAt: string;
};

type ProjectForm = Omit<
  ResearchProject,
  | "id"
  | "references"
  | "sections"
  | "status"
  | "completedSections"
  | "totalSections"
  | "currentSection"
  | "generationError"
  | "updatedAt"
> & { id?: string };

const EMPTY_FORM: ProjectForm = {
  title: "",
  studentName: "",
  admissionNumber: "",
  course: "",
  department: "",
  studyLocation: "",
  supervisorName: "",
  studyDesign: "",
  targetPopulation: "",
  studyPeriodStart: "",
  studyPeriodEnd: "",
  targetPages: 30,
  researchQuestions: "",
  broadObjective: "",
  specificObjectives: "",
  confidenceLevel: 95,
  proportionEstimate: 50,
  marginOfError: 5,
  populationSize: null,
  nonresponseRate: 10,
  workPlanStartDate: "",
  workPlanDurationMonths: 6,
  budgetItems: [],
  mapPoint: null,
};

const inputClass =
  "w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition focus:border-emerald-600/60 focus:ring-2 focus:ring-emerald-600/15 placeholder:text-muted-foreground/70";
const labelClass = "mb-1.5 block text-xs font-semibold tracking-wide text-foreground/80";
const panelClass = "rounded-2xl border border-border/80 bg-card shadow-sm";

function toForm(project?: ResearchProject | null, studentName = ""): ProjectForm {
  if (!project) return { ...EMPTY_FORM, studentName };
  return {
    id: project.id,
    title: project.title || "",
    studentName: project.studentName || studentName,
    admissionNumber: project.admissionNumber || "",
    course: project.course || "",
    department: project.department || "",
    studyLocation: project.studyLocation || "",
    supervisorName: project.supervisorName || "",
    studyDesign: project.studyDesign || "",
    targetPopulation: project.targetPopulation || "",
    studyPeriodStart: project.studyPeriodStart || "",
    studyPeriodEnd: project.studyPeriodEnd || "",
    targetPages: project.targetPages ?? 30,
    researchQuestions: Array.isArray(project.researchQuestions)
      ? project.researchQuestions.join("\n")
      : project.researchQuestions || "",
    broadObjective: project.broadObjective || "",
    specificObjectives: Array.isArray(project.specificObjectives)
      ? project.specificObjectives.join("\n")
      : project.specificObjectives || "",
    confidenceLevel: project.confidenceLevel || 95,
    proportionEstimate: project.proportionEstimate ?? 50,
    marginOfError: project.marginOfError ?? 5,
    populationSize: project.populationSize ?? null,
    nonresponseRate: project.nonresponseRate ?? 10,
    workPlanStartDate: project.workPlanStartDate || "",
    workPlanDurationMonths: project.workPlanDurationMonths ?? 6,
    budgetItems: project.budgetItems || [],
    mapPoint: project.mapPoint ?? null,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function formatDate(value?: string) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function statusLabel(status: ProjectStatus) {
  const labels: Record<ProjectStatus, string> = {
    draft: "Draft",
    queued: "Queued",
    generating: "In progress",
    ready: "Ready",
    failed: "Needs attention",
  };
  return labels[status];
}

function StatusPill({ status }: { status: ProjectStatus }) {
  const styles: Record<ProjectStatus, string> = {
    draft: "bg-muted text-muted-foreground",
    queued: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    generating: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-300",
    ready: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-300",
    failed: "bg-destructive/10 text-destructive",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles[status]}`}>
      {status === "generating" || status === "queued" ? (
        <LoaderCircle className="h-3 w-3 animate-spin" />
      ) : status === "ready" ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : status === "failed" ? (
        <AlertCircle className="h-3 w-3" />
      ) : (
        <FileText className="h-3 w-3" />
      )}
      {statusLabel(status)}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
  min,
  max,
  step,
  help,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className={labelClass}>{label}{required && <span className="ml-1 text-emerald-700">*</span>}</span>
      <input
        className={inputClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        required={required}
        min={min}
        max={max}
        step={step}
      />
      {help && <span className="mt-1 block text-[11px] text-muted-foreground">{help}</span>}
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  help,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  help?: string;
}) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <textarea
        className={`${inputClass} resize-y leading-relaxed`}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      {help && <span className="mt-1 block text-[11px] text-muted-foreground">{help}</span>}
    </label>
  );
}

function ProjectFormView({
  initial,
  studentName,
  saving,
  error,
  onCancel,
  onAutosave,
  onSearchMap,
  onSubmit,
}: {
  initial: ProjectForm;
  studentName: string;
  saving: boolean;
  error: string;
  onCancel: () => void;
  onAutosave: (form: ProjectForm) => Promise<ResearchProject>;
  onSearchMap: (query: string) => Promise<StudyAreaPoint[]>;
  onSubmit: (form: ProjectForm) => void;
}) {
  const [form, setForm] = useState<ProjectForm>(() => ({ ...initial }));
  const [autosaveState, setAutosaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [mapResults, setMapResults] = useState<StudyAreaPoint[]>([]);
  const [mapSearching, setMapSearching] = useState(false);
  const [mapMessage, setMapMessage] = useState("");
  const lastSavedForm = useRef(JSON.stringify(initial));
  const update = <K extends keyof ProjectForm>(key: K, value: ProjectForm[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const searchMap = async () => {
    setMapSearching(true);
    setMapMessage("");
    try {
      const results = await onSearchMap(form.studyLocation);
      setMapResults(results);
      setMapMessage(results.length
        ? "Choose the matching place. Its map will appear in Appendix IV."
        : "No matching map locations were found. Try a more specific place name.");
    } catch (error) {
      setMapResults([]);
      setMapMessage(errorMessage(error));
    } finally {
      setMapSearching(false);
    }
  };
  const updateBudget = (index: number, key: keyof BudgetItem, value: string) => {
    setForm((previous) => ({
      ...previous,
      budgetItems: previous.budgetItems.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, [key]: key === "item" ? value : Number(value) || 0 }
          : item,
      ),
    }));
  };

  useEffect(() => {
    if (!form.title.trim()) {
      setAutosaveState("idle");
      return;
    }
    const snapshot = JSON.stringify(form);
    if (snapshot === lastSavedForm.current) return;

    setAutosaveState("saving");
    const timer = window.setTimeout(() => {
      void onAutosave(form)
        .then((project) => {
          const savedForm = form.id ? form : { ...form, id: project.id };
          lastSavedForm.current = JSON.stringify(savedForm);
          setForm((current) => current.id ? current : { ...current, id: project.id });
          setAutosaveState("saved");
        })
        .catch(() => setAutosaveState("error"));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [form, onAutosave]);

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(form);
      }}
    >
      <div className="flex flex-col gap-3 border-b border-border/70 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <button type="button" onClick={onCancel} className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to projects
          </button>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">Project setup</div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {form.id ? "Edit project details" : "Set up your study"}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Start with your research topic. Add any details you already know; Sasyna will draft the proposal and save your progress automatically.
          </p>
          <p aria-live="polite" className="mt-2 text-xs text-muted-foreground">
            {autosaveState === "saving" ? "Saving your draft…" : autosaveState === "saved" ? "Draft saved to your account" : autosaveState === "error" ? "Auto-save failed. Check your connection, then try again." : "Only the research title is required to begin."}
          </p>
        </div>
        <button
          type="submit"
          disabled={saving || !form.title.trim()}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
        >
          {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving…" : form.id ? "Save changes" : "Create project"}
        </button>
      </div>

      {error && <ErrorBanner message={error} />}

      <section className={`${panelClass} p-4 sm:p-6`}>
        <SectionHeading number="01" title="Study identity" description="The essentials that shape your proposal." />
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Research title" value={form.title} onChange={(v) => update("title", v)} placeholder="A clear working title for your study" required />
          </div>
          <Field label="Student name" value={form.studentName || studentName} onChange={(v) => update("studentName", v)} placeholder="Your name" />
          <Field label="Admission number" value={form.admissionNumber} onChange={(v) => update("admissionNumber", v)} placeholder="Add when available" />
          <Field label="Course / programme" value={form.course} onChange={(v) => update("course", v)} placeholder="e.g. Master of Public Health" />
          <Field label="Department" value={form.department} onChange={(v) => update("department", v)} placeholder="Your department" />
          <div className="sm:col-span-2">
            <span className={labelClass}>Study location and map</span>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className={inputClass}
                value={form.studyLocation}
                onChange={(event) => {
                  const studyLocation = event.target.value;
                  setForm((previous) => ({
                    ...previous,
                    studyLocation,
                    mapPoint: previous.mapPoint?.label === studyLocation ? previous.mapPoint : null,
                  }));
                  setMapResults([]);
                  setMapMessage("");
                }}
                placeholder="Search a hospital, town, county, or study site"
                aria-label="Study location"
              />
              <button
                type="button"
                onClick={() => void searchMap()}
                disabled={mapSearching || form.studyLocation.trim().length < 3}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-border px-3.5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                {mapSearching ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                {mapSearching ? "Searching…" : "Find on map"}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Search sends only the location text to OpenStreetMap. Select a result to create the Appendix IV map.
            </p>
            {form.mapPoint && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-700/20 bg-emerald-700/5 p-3 text-xs text-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">Map location selected</p>
                  <p className="mt-0.5 break-words text-muted-foreground">{form.mapPoint.label}</p>
                  <p className="mt-0.5 text-muted-foreground">
                    {form.mapPoint.latitude.toFixed(5)}, {form.mapPoint.longitude.toFixed(5)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => update("mapPoint", null)}
                  className="shrink-0 font-semibold text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
            )}
            {mapResults.length > 0 && (
              <div className="mt-2 overflow-hidden rounded-xl border border-border">
                {mapResults.map((point) => (
                  <button
                    key={`${point.latitude}:${point.longitude}:${point.label}`}
                    type="button"
                    onClick={() => {
                      setForm((previous) => ({ ...previous, studyLocation: point.label, mapPoint: point }));
                      setMapResults([]);
                      setMapMessage("Location selected. The map will be generated in the Word document.");
                    }}
                    className="flex w-full items-start gap-2 border-b border-border/70 px-3 py-2.5 text-left text-xs transition last:border-b-0 hover:bg-muted"
                  >
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" />
                    <span className="min-w-0 flex-1 break-words">{point.label}</span>
                    <span className="shrink-0 font-semibold text-emerald-700">Select</span>
                  </button>
                ))}
              </div>
            )}
            {mapMessage && <p role="status" className="mt-2 text-xs text-muted-foreground">{mapMessage}</p>}
          </div>
          <Field label="Supervisor" value={form.supervisorName} onChange={(v) => update("supervisorName", v)} placeholder="Supervisor name" />
        </div>
      </section>

      <section className={`${panelClass} p-4 sm:p-6`}>
        <SectionHeading number="02" title="Research framework" description="Define your questions, objectives, and study approach." />
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Study design" value={form.studyDesign} onChange={(v) => update("studyDesign", v)} placeholder="e.g. Cross-sectional study" />
          <Field label="Target population" value={form.targetPopulation} onChange={(v) => update("targetPopulation", v)} placeholder="Who will take part?" />
          <div className="sm:col-span-2">
            <TextAreaField label="Broad objective" value={form.broadObjective} onChange={(v) => update("broadObjective", v)} placeholder="What is the overall aim of this research?" rows={2} />
          </div>
          <div className="sm:col-span-2">
            <TextAreaField label="Specific objectives" value={String(form.specificObjectives || "")} onChange={(v) => update("specificObjectives", v)} placeholder="One objective per line" rows={3} help="Enter one objective per line." />
          </div>
          <div className="sm:col-span-2">
            <TextAreaField label="Research questions" value={String(form.researchQuestions || "")} onChange={(v) => update("researchQuestions", v)} placeholder="One research question per line" rows={3} help="Enter one question per line." />
          </div>
        </div>
      </section>

      <section className={`${panelClass} p-4 sm:p-6`}>
        <SectionHeading number="03" title="Timeline & scope" description="Set the study period and your intended proposal length." />
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Study period starts" value={form.studyPeriodStart} onChange={(v) => update("studyPeriodStart", v)} type="date" />
          <Field label="Study period ends" value={form.studyPeriodEnd} onChange={(v) => update("studyPeriodEnd", v)} type="date" />
          <Field label="Target pages" value={form.targetPages} onChange={(v) => update("targetPages", Number(v) || 0)} type="number" min={1} />
          <Field label="Work plan start date" value={form.workPlanStartDate} onChange={(v) => update("workPlanStartDate", v)} type="date" />
          <Field label="Work plan duration (months)" value={form.workPlanDurationMonths} onChange={(v) => update("workPlanDurationMonths", Number(v) || 0)} type="number" min={1} />
        </div>
      </section>

      <section className={`${panelClass} p-4 sm:p-6`}>
        <SectionHeading number="04" title="Sample size assumptions" description="Use your institution's guidance if these values have been specified." />
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className={labelClass}>Confidence level</span>
            <select className={inputClass} value={form.confidenceLevel} onChange={(e) => update("confidenceLevel", Number(e.target.value) as 90 | 95 | 99)}>
              <option value={90}>90%</option><option value={95}>95%</option><option value={99}>99%</option>
            </select>
          </label>
          <Field label="Proportion estimate (%)" value={form.proportionEstimate} onChange={(v) => update("proportionEstimate", Number(v) || 0)} type="number" min={0} max={100} step={0.1} />
          <Field label="Margin of error (%)" value={form.marginOfError} onChange={(v) => update("marginOfError", Number(v) || 0)} type="number" min={0} max={100} step={0.1} />
          <Field label="Population size (optional)" value={form.populationSize ?? ""} onChange={(v) => update("populationSize", v === "" ? null : Number(v))} type="number" min={1} placeholder="Leave blank if unknown" />
          <Field label="Non-response rate (%)" value={form.nonresponseRate} onChange={(v) => update("nonresponseRate", Number(v) || 0)} type="number" min={0} max={100} step={0.1} />
        </div>
      </section>

      <section className={`${panelClass} p-4 sm:p-6`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <SectionHeading number="05" title="Working budget" description="Optional estimates to keep your plan grounded." />
          <button
            type="button"
            onClick={() => setForm((previous) => ({ ...previous, budgetItems: [...previous.budgetItems, { item: "", quantity: 1, unitCost: 0 }] }))}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" /> Add budget line
          </button>
        </div>
        {form.budgetItems.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-5 text-center text-sm text-muted-foreground">
            No budget lines added. This section is optional.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {form.budgetItems.map((item, index) => (
              <div key={`${index}-${item.item}`} className="grid gap-2 rounded-xl bg-muted/30 p-3 sm:grid-cols-[1fr_110px_140px_auto]">
                <input className={inputClass} aria-label="Budget item" placeholder="Budget item" value={item.item} onChange={(e) => updateBudget(index, "item", e.target.value)} />
                <input className={inputClass} aria-label="Quantity" type="number" min={0} placeholder="Quantity" value={item.quantity} onChange={(e) => updateBudget(index, "quantity", e.target.value)} />
                <input className={inputClass} aria-label="Unit cost" type="number" min={0} step="0.01" placeholder="Unit cost" value={item.unitCost} onChange={(e) => updateBudget(index, "unitCost", e.target.value)} />
                <button type="button" aria-label="Remove budget line" onClick={() => setForm((previous) => ({ ...previous, budgetItems: previous.budgetItems.filter((_, itemIndex) => itemIndex !== index) }))} className="inline-flex h-10 items-center justify-center rounded-lg px-3 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground">Cancel</button>
        <button type="submit" disabled={saving || !form.title.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500">
          {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving…" : form.id ? "Save project details" : "Create project"}
        </button>
      </div>
    </form>
  );
}

function SectionHeading({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-700/10 font-mono text-[11px] font-bold text-emerald-700 dark:text-emerald-400">{number}</span>
      <div>
        <h2 className="text-base font-bold text-foreground">{title}</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-3.5 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2.5"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{message}</span></div>
      {onRetry && <button type="button" onClick={onRetry} className="inline-flex shrink-0 items-center gap-1.5 self-start font-semibold hover:underline sm:self-auto"><RefreshCw className="h-3.5 w-3.5" /> Try again</button>}
    </div>
  );
}

export default function ResearchStudio() {
  const { user, name } = useAuth();
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<ResearchProject | null>(null);
  const [screen, setScreen] = useState<"list" | "create" | "details" | "edit">("list");
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [formError, setFormError] = useState("");
  const [savingForm, setSavingForm] = useState(false);
  const [savingSections, setSavingSections] = useState(false);
  const [sectionsDirty, setSectionsDirty] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [query, setQuery] = useState("");
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  const displayName = name || user?.user_metadata?.full_name || user?.user_metadata?.name || "";

  const authHeaders = useCallback(async (json = false): Promise<Record<string, string>> => {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw new Error(error.message || "Unable to verify your session.");
    if (!session?.access_token) throw new Error("Your session has expired. Sign in again to continue.");
    return {
      Authorization: `Bearer ${session.access_token}`,
      ...(json ? { "Content-Type": "application/json" } : {}),
    };
  }, []);

  const request = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const headers = await authHeaders(init?.body !== undefined);
    const response = await fetch(path, { ...init, headers: { ...headers, ...init?.headers } });
    let payload: unknown;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok) {
      const apiError = payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed (${response.status}).`;
      throw new Error(apiError);
    }
    return payload as T;
  }, [authHeaders]);

  const searchMapLocations = useCallback(async (query: string) => {
    const result = await request<{ points: StudyAreaPoint[] }>(
      `/api/research/map/search?q=${encodeURIComponent(query)}`,
    );
    return result.points;
  }, [request]);

  const loadProjects = useCallback(async (showLoading = true) => {
    if (showLoading) setListLoading(true);
    setListError("");
    try {
      const result = await request<{ projects: ResearchProject[] }>("/api/research/projects");
      setProjects(Array.isArray(result.projects) ? result.projects : []);
    } catch (error) {
      setListError(errorMessage(error));
    } finally {
      if (showLoading) setListLoading(false);
    }
  }, [request]);

  const loadProject = useCallback(async (id: string, showLoading = true) => {
    if (showLoading) setDetailLoading(true);
    setDetailError("");
    try {
      const result = await request<{ project: ResearchProject }>(`/api/research/projects/${encodeURIComponent(id)}`);
      setSelectedProject(result.project);
      setProjects((current) => current.map((project) => project.id === result.project.id ? result.project : project));
      return result.project;
    } catch (error) {
      setDetailError(errorMessage(error));
      return null;
    } finally {
      if (showLoading) setDetailLoading(false);
    }
  }, [request]);

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  useEffect(() => {
    if (!selectedProject || (selectedProject.status !== "queued" && selectedProject.status !== "generating")) return;
    const timer = window.setInterval(() => { void loadProject(selectedProject.id, false); }, 3000);
    return () => window.clearInterval(timer);
  }, [selectedProject?.id, selectedProject?.status, loadProject]);

  const filteredProjects = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return projects;
    return projects.filter((project) => [project.title, project.course, project.department].some((value) => value?.toLowerCase().includes(term)));
  }, [projects, query]);

  const openProject = async (project: ResearchProject) => {
    setSelectedProject(project);
    setScreen("details");
    setActiveSection(null);
    setDetailError("");
    await loadProject(project.id);
  };

  const persistProjectForm = useCallback(async (form: ProjectForm) => {
    const { id: formId, ...details } = form;
    const id = formId || draftIdRef.current;
    const payload = {
      ...details,
      title: details.title.trim(),
      studentName: details.studentName.trim() || displayName,
      targetPages: Number(details.targetPages) || 0,
      confidenceLevel: details.confidenceLevel,
      proportionEstimate: Number(details.proportionEstimate) || 0,
      marginOfError: Number(details.marginOfError) || 0,
      populationSize: details.populationSize === null || details.populationSize === 0 ? null : Number(details.populationSize),
      nonresponseRate: Number(details.nonresponseRate) || 0,
      workPlanDurationMonths: Number(details.workPlanDurationMonths) || 0,
      budgetItems: details.budgetItems.filter((item) => item.item.trim()).map((item) => ({
        ...item,
        item: item.item.trim(),
        quantity: Number(item.quantity) || 0,
        unitCost: Number(item.unitCost) || 0,
      })),
    };
    const result = id
      ? await request<{ project: ResearchProject }>(`/api/research/projects/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) })
      : await request<{ project: ResearchProject }>("/api/research/projects", { method: "POST", body: JSON.stringify(payload) });
    draftIdRef.current = result.project.id;
    setProjects((current) => {
      const found = current.some((project) => project.id === result.project.id);
      return found ? current.map((project) => project.id === result.project.id ? result.project : project) : [result.project, ...current];
    });
    return result.project;
  }, [request]);

  const saveProjectDraft = useCallback((form: ProjectForm) => {
    const operation = saveQueueRef.current.then(
      () => persistProjectForm(form),
      () => persistProjectForm(form),
    );
    saveQueueRef.current = operation.then(() => undefined, () => undefined);
    return operation;
  }, [persistProjectForm]);

  const submitProject = async (form: ProjectForm) => {
    setSavingForm(true);
    setFormError("");
    try {
      const project = await saveProjectDraft(form);
      setSelectedProject(project);
      setScreen("details");
      setSectionsDirty(false);
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setSavingForm(false);
    }
  };

  const saveSections = async () => {
    if (!selectedProject) return;
    setSavingSections(true);
    setDetailError("");
    try {
      const result = await request<{ project: ResearchProject }>(`/api/research/projects/${encodeURIComponent(selectedProject.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ sections: selectedProject.sections }),
      });
      setSelectedProject(result.project);
      setProjects((current) => current.map((project) => project.id === result.project.id ? result.project : project));
      setSectionsDirty(false);
    } catch (error) {
      setDetailError(`Section changes were not saved. ${errorMessage(error)}`);
    } finally {
      setSavingSections(false);
    }
  };

  useEffect(() => {
    if (!sectionsDirty || !selectedProject || savingSections) return;
    const timer = window.setTimeout(() => void saveSections(), 900);
    return () => window.clearTimeout(timer);
  }, [selectedProject, sectionsDirty, savingSections]);

  const startGeneration = async () => {
    if (!selectedProject) return;
    setGenerating(true);
    setDetailError("");
    try {
      const result = await request<{ project: ResearchProject }>(`/api/research/projects/${encodeURIComponent(selectedProject.id)}/generate`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setSelectedProject(result.project);
      setProjects((current) => current.map((project) => project.id === result.project.id ? result.project : project));
    } catch (error) {
      setDetailError(`Could not start the project. ${errorMessage(error)}`);
    } finally {
      setGenerating(false);
    }
  };

  const regenerateFromScratch = async () => {
    if (!selectedProject || isWorking) return;
    const confirmed = window.confirm(
      "This clears all proposal sections and citations, including edits made inside those sections. Your title, study details, objectives, dates, sample-size assumptions, budget, and map location will be kept. Start a new draft?",
    );
    if (!confirmed) return;

    const hadUnsavedSectionEdits = sectionsDirty;
    setSectionsDirty(false);
    setGenerating(true);
    setDetailError("");
    try {
      const result = await request<{ project: ResearchProject }>(
        `/api/research/projects/${encodeURIComponent(selectedProject.id)}/generate`,
        { method: "POST", body: JSON.stringify({ restart: true }) },
      );
      setSelectedProject(result.project);
      setProjects((current) => current.map((project) =>
        project.id === result.project.id ? result.project : project,
      ));
    } catch (error) {
      setSectionsDirty(hadUnsavedSectionEdits);
      setDetailError(`Could not restart the proposal. ${errorMessage(error)}`);
    } finally {
      setGenerating(false);
    }
  };

  const exportProposal = async () => {
    if (!selectedProject) return;
    setExporting(true);
    setDetailError("");
    try {
      const blob = await createResearchProposalDocument(selectedProject, await authHeaders());
      downloadProposalDocument(blob, selectedProject.title);
    } catch (error) {
      setDetailError(`Could not prepare the Word document. ${errorMessage(error)}`);
    } finally {
      setExporting(false);
    }
  };

  const updateSection = (id: string, content: string) => {
    setSelectedProject((current) => current ? {
      ...current,
      sections: current.sections.map((section) => section.id === id ? { ...section, content } : section),
    } : current);
    setSectionsDirty(true);
  };

  const progress = selectedProject && selectedProject.totalSections > 0
    ? Math.min(100, Math.round((selectedProject.completedSections / selectedProject.totalSections) * 100))
    : 0;
  const isWorking = selectedProject?.status === "queued" || selectedProject?.status === "generating";

  if (screen === "create" || screen === "edit") {
    return (
      <div className="mx-auto max-w-5xl pb-10">
        <ProjectFormView
          key={`${screen}-${selectedProject?.id || "new"}`}
          initial={screen === "edit" ? toForm(selectedProject, displayName) : toForm(null, displayName)}
          studentName={displayName}
          saving={savingForm}
          error={formError}
          onAutosave={saveProjectDraft}
          onSearchMap={searchMapLocations}
          onCancel={() => { setFormError(""); setScreen(screen === "edit" ? "details" : "list"); }}
          onSubmit={submitProject}
        />
      </div>
    );
  }

  if (screen === "details" && selectedProject) {
    return (
      <div className="mx-auto max-w-7xl space-y-5 pb-10">
        <div className="flex flex-col gap-4 border-b border-border/70 pb-5 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <button type="button" onClick={() => { setScreen("list"); setDetailError(""); }} className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> All projects
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={selectedProject.status} />
              <span className="text-xs text-muted-foreground">Updated {formatDate(selectedProject.updatedAt)}</span>
            </div>
            <h1 className="mt-2 max-w-3xl text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{selectedProject.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {[selectedProject.course, selectedProject.department, selectedProject.studyLocation].filter(Boolean).join(" · ") || "Research project"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setFormError(""); setScreen("edit"); }} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted">
              <Pencil className="h-4 w-4" /> Edit details
            </button>
            {selectedProject.status === "draft" && (
              <button type="button" disabled={generating} onClick={startGeneration} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500">
                {generating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Start writing
              </button>
            )}
            {selectedProject.status === "ready" && (
              <button type="button" disabled={exporting || isWorking} onClick={() => void exportProposal()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-700/25 bg-emerald-700/5 px-4 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-700/10 disabled:opacity-60 dark:text-emerald-300">
                {exporting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                {exporting ? "Preparing Word file…" : "Download Word"}
              </button>
            )}
            {(selectedProject.status === "ready" || selectedProject.status === "failed") && (
              <button
                type="button"
                disabled={generating || isWorking}
                onClick={() => void regenerateFromScratch()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm font-semibold text-destructive transition hover:bg-destructive/10 disabled:opacity-60"
              >
                {generating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Clear draft & regenerate
              </button>
            )}
            {(selectedProject.status === "failed" || (selectedProject.status === "ready" && selectedProject.completedSections < selectedProject.totalSections)) && (
              <button type="button" disabled={generating} onClick={startGeneration} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500">
                {generating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Retry / resume
              </button>
            )}
          </div>
        </div>

        {detailError && <ErrorBanner message={detailError} onRetry={() => void loadProject(selectedProject.id)} />}
        {detailLoading && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin text-emerald-700" /> Refreshing the latest project…
          </div>
        )}

        {(isWorking || selectedProject.status === "ready") && (
          <section className={`${panelClass} overflow-hidden`}>
            <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-700/10 text-emerald-700 dark:text-emerald-400">
                {selectedProject.status === "ready" ? <CheckCircle2 className="h-5 w-5" /> : <LoaderCircle className="h-5 w-5 animate-spin" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-bold text-foreground">{selectedProject.status === "ready" ? "Your draft is ready" : "Your research draft is underway"}</h2>
                  <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">{selectedProject.completedSections} / {selectedProject.totalSections} sections</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isWorking
                    ? selectedProject.currentSection ? `Working on ${selectedProject.currentSection}. This page updates as sections are completed.` : "We’ll keep this project updated as each section is completed."
                    : "Literature citations use scholarly catalog records when available. Check that each source supports its claim and follow your institution’s requirements."}
                </p>
                {!isWorking && selectedProject.references.some((reference) => reference.source === "AI-generated") && (
                  <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                    This project has older AI-generated reference entries that are unverified and were not used for new citations.
                  </p>
                )}
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-500" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>
            {selectedProject.status === "failed" && selectedProject.generationError && (
              <div className="border-t border-destructive/15 bg-destructive/5 px-4 py-3 text-sm text-destructive sm:px-5">
                <span className="font-semibold">Generation paused:</span> {selectedProject.generationError}
              </div>
            )}
          </section>
        )}

        {selectedProject.status === "failed" && (
          <div role="alert" className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-foreground">
            <span className="font-semibold">Generation paused. Completed sections are saved.</span>{" "}
            {selectedProject.generationError || "Retry or resume to continue from the saved sections."}
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <section className={`${panelClass} p-4`}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-foreground">Document outline</h2>
                <span className="text-xs text-muted-foreground">{selectedProject.sections.length}</span>
              </div>
              {selectedProject.sections.length === 0 ? (
                <div className="mt-4 rounded-xl bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                  Sections will appear here as they are added to your project.
                </div>
              ) : (
                <nav className="mt-3 space-y-1">
                  {selectedProject.sections.map((section, index) => (
                    <button key={section.id} type="button" onClick={() => { setActiveSection(section.id); document.getElementById(`research-section-${section.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition ${activeSection === section.id ? "bg-emerald-700/10 text-emerald-800 dark:text-emerald-300" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                      <span className="mt-0.5 w-5 shrink-0 font-mono text-[10px] opacity-60">{String(index + 1).padStart(2, "0")}</span>
                      <span className="line-clamp-2 text-xs font-medium leading-5">{section.heading}</span>
                    </button>
                  ))}
                </nav>
              )}
            </section>

            <section className={`${panelClass} p-4`}>
              <div className="flex items-center gap-2 text-sm font-bold text-foreground"><ShieldCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-400" /> Study details</div>
              <dl className="mt-3 space-y-3">
                <DetailLine label="Study design" value={selectedProject.studyDesign} />
                <DetailLine label="Population" value={selectedProject.targetPopulation} />
                <DetailLine label="Study location" value={selectedProject.studyLocation} />
                <DetailLine
                  label="Appendix IV map"
                  value={selectedProject.mapPoint ? "Study-area map ready" : "Choose a map location in Edit details"}
                />
                <DetailLine label="Study period" value={selectedProject.studyPeriodStart || selectedProject.studyPeriodEnd ? `${formatDate(selectedProject.studyPeriodStart)} – ${formatDate(selectedProject.studyPeriodEnd)}` : ""} />
                <DetailLine label="Supervisor" value={selectedProject.supervisorName} />
              </dl>
              <button type="button" onClick={() => { setFormError(""); setScreen("edit"); }} className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 transition hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300">
                <Pencil className="h-3 w-3" /> Edit study details
              </button>
            </section>
          </aside>

          <main className="min-w-0 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-foreground">Research document</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Review and revise each section before you share your work.</p>
              </div>
              <button type="button" disabled={!sectionsDirty || savingSections} onClick={saveSections} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">
                {savingSections ? <LoaderCircle className="h-4 w-4 animate-spin" /> : sectionsDirty ? <Save className="h-4 w-4" /> : <Check className="h-4 w-4 text-emerald-700" />}
                {savingSections ? "Saving sections…" : sectionsDirty ? "Save section changes" : "All changes saved"}
              </button>
            </div>
            {selectedProject.sections.length === 0 ? (
              <div className={`${panelClass} flex min-h-[300px] flex-col items-center justify-center px-6 py-12 text-center`}>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-700/10 text-emerald-700 dark:text-emerald-400">
                  {isWorking ? <LoaderCircle className="h-6 w-6 animate-spin" /> : <BookOpen className="h-6 w-6" />}
                </div>
                <h3 className="mt-4 text-base font-bold text-foreground">{isWorking ? "Your outline is taking shape" : "No sections yet"}</h3>
                <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  {isWorking ? "Completed sections are saved automatically and will appear here as they’re ready." : "Start writing to create the first sections of your research document."}
                </p>
                {selectedProject.status === "draft" && (
                  <button type="button" disabled={generating} onClick={startGeneration} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600">
                    {generating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Start writing
                  </button>
                )}
              </div>
            ) : (
              selectedProject.sections.map((section, index) => (
                <section key={section.id} id={`research-section-${section.id}`} className={`${panelClass} scroll-mt-6 overflow-hidden`}>
                  <div className="flex items-start gap-3 border-b border-border/60 bg-muted/20 px-4 py-3.5 sm:px-5">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background font-mono text-[10px] font-bold text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-foreground">{section.heading}</h3>
                      {section.citationIds && section.citationIds.length > 0 && <p className="mt-1 text-[11px] text-muted-foreground">{section.citationIds.length} cited reference{section.citationIds.length === 1 ? "" : "s"}</p>}
                    </div>
                    {section.content.trim() && <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />}
                  </div>
                  <textarea
                    aria-label={`Edit ${section.heading}`}
                    value={section.content}
                    onFocus={() => setActiveSection(section.id)}
                    onChange={(event) => updateSection(section.id, event.target.value)}
                    rows={Math.max(6, Math.min(18, Math.ceil((section.content.length || 350) / 105)))}
                    placeholder="This section is still being prepared…"
                    className="w-full resize-y border-0 bg-transparent px-4 py-4 text-sm leading-7 text-foreground outline-none placeholder:text-muted-foreground/60 focus:ring-0 sm:px-5"
                  />
                </section>
              ))
            )}
            {selectedProject.references.length > 0 && (
              <section className={`${panelClass} overflow-hidden`}>
                <button type="button" onClick={() => setActiveSection(activeSection === "references" ? null : "references")} className="flex w-full items-center justify-between px-4 py-4 text-left sm:px-5">
                  <span className="flex items-center gap-2 font-bold text-foreground"><BookOpen className="h-4 w-4 text-emerald-700 dark:text-emerald-400" /> References <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{selectedProject.references.length}</span></span>
                  {activeSection === "references" ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>
                {activeSection === "references" && <div className="space-y-3 border-t border-border/60 px-4 py-4 sm:px-5">
                  {selectedProject.references.map((reference) => (
                    <article key={reference.id} className="rounded-xl bg-muted/25 p-3.5">
                      <h3 className="text-sm font-semibold leading-relaxed text-foreground">{reference.title}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {reference.authors.map((author) => `${author.lastName}${author.initials ? ` ${author.initials}` : author.firstName ? ` ${author.firstName}` : ""}`).join(", ")}
                        {reference.year ? ` (${reference.year})` : ""}
                        {reference.journal ? `. ${reference.journal}` : ""}
                        {reference.volume ? `, ${reference.volume}` : ""}
                        {reference.issue ? `(${reference.issue})` : ""}
                        {reference.pages ? `, ${reference.pages}` : ""}
                      </p>
                      <p className={`mt-1 text-[11px] font-medium ${
                        reference.source === "AI-generated"
                          ? "text-amber-700 dark:text-amber-400"
                          : "text-emerald-700 dark:text-emerald-400"
                      }`}>
                        {reference.source === "AI-generated"
                          ? "Older AI-generated entry · unverified"
                          : `${reference.source ?? "Source"} catalog record`}
                      </p>
                      {(reference.doi || reference.pmid || reference.pmcid) && <p className="mt-1 text-[11px] text-muted-foreground">{[reference.doi && `DOI ${reference.doi}`, reference.pmid && `PMID ${reference.pmid}`, reference.pmcid && `PMCID ${reference.pmcid}`].filter(Boolean).join(" · ")}</p>}
                      {reference.abstract && <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{reference.abstract}</p>}
                    </article>
                  ))}
                </div>}
              </section>
            )}
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      <div className="relative overflow-hidden rounded-2xl border border-emerald-800/10 bg-card px-5 py-6 shadow-sm sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 opacity-50 sm:block" aria-hidden="true">
          <div className="absolute right-8 top-[-90px] h-72 w-72 rounded-full border border-emerald-700/10" />
          <div className="absolute right-20 top-[-40px] h-56 w-56 rounded-full border border-emerald-700/10" />
          <div className="absolute right-32 top-[10px] h-40 w-40 rounded-full border border-emerald-700/10" />
        </div>
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> Sasyna · Student workspace
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Research Studio</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {displayName ? `Welcome back, ${displayName.split(" ")[0]}. ` : ""}
              Bring your study into focus, from the first question to a document you can confidently revise.
            </p>
          </div>
          <button type="button" onClick={() => { draftIdRef.current = null; setSelectedProject(null); setFormError(""); setScreen("create"); }} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500">
            <FilePlus2 className="h-4 w-4" /> New research project
          </button>
        </div>
      </div>

      {listError && <ErrorBanner message={listError} onRetry={() => void loadProjects()} />}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-foreground">Your projects</h2>
            {!listLoading && <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{projects.length}</span>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Your work is saved to your account and ready when you are.</p>
        </div>
        {projects.length > 0 && (
          <label className="relative block w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input className={`${inputClass} pl-9`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a project" aria-label="Find a project" />
          </label>
        )}
      </div>

      {listLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => <div key={item} className={`${panelClass} animate-pulse p-5`}>
            <div className="h-5 w-2/3 rounded bg-muted" /><div className="mt-3 h-3 w-1/2 rounded bg-muted" />
            <div className="mt-8 h-2 w-full rounded bg-muted" /><div className="mt-4 h-9 w-28 rounded-lg bg-muted" />
          </div>)}
        </div>
      ) : filteredProjects.length === 0 ? (
        projects.length === 0 ? (
          <section className={`${panelClass} relative overflow-hidden px-6 py-12 text-center sm:py-16`}>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-700/10 text-emerald-700 dark:text-emerald-400"><BookOpen className="h-6 w-6" /></div>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">A good place to begin</p>
            <h3 className="mt-2 text-xl font-bold text-foreground">Your next idea starts here.</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Create a research project to organize your study details, shape the proposal, and keep every completed section in one place.</p>
            <button type="button" onClick={() => { draftIdRef.current = null; setSelectedProject(null); setFormError(""); setScreen("create"); }} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 dark:bg-emerald-600">
              <Plus className="h-4 w-4" /> Create your first project
            </button>
          </section>
        ) : (
          <div className={`${panelClass} px-6 py-12 text-center`}>
            <Search className="mx-auto h-6 w-6 text-muted-foreground" />
            <h3 className="mt-3 font-semibold text-foreground">No matching projects</h3>
            <p className="mt-1 text-sm text-muted-foreground">Try a different title, course, or department.</p>
            <button type="button" onClick={() => setQuery("")} className="mt-3 text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400">Clear search</button>
          </div>
        )
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredProjects.map((project) => {
            const pct = project.totalSections > 0 ? Math.min(100, Math.round(project.completedSections / project.totalSections * 100)) : 0;
            return (
              <article key={project.id} className={`${panelClass} group flex min-h-[230px] flex-col p-5 transition duration-200 hover:-translate-y-0.5 hover:border-emerald-700/25 hover:shadow-md`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700/10 text-emerald-700 dark:text-emerald-400"><FileText className="h-5 w-5" /></div>
                  <StatusPill status={project.status} />
                </div>
                <button type="button" onClick={() => void openProject(project)} className="mt-4 text-left">
                  <h3 className="line-clamp-2 text-base font-bold leading-snug text-foreground transition group-hover:text-emerald-800 dark:group-hover:text-emerald-300">{project.title}</h3>
                </button>
                <p className="mt-1.5 line-clamp-1 text-xs text-muted-foreground">{[project.course, project.department].filter(Boolean).join(" · ") || "Research project"}</p>
                <div className="mt-auto pt-5">
                  <div className="mb-2 flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">{project.completedSections} of {project.totalSections} sections</span>
                    <span className="font-mono font-semibold text-foreground">{pct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} /></div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><Clock3 className="h-3.5 w-3.5" /> Updated {formatDate(project.updatedAt)}</span>
                    <button type="button" onClick={() => void openProject(project)} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 transition group-hover:gap-2 dark:text-emerald-400">
                      Open <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-xs font-medium text-foreground">{value}</dd>
    </div>
  );
}
