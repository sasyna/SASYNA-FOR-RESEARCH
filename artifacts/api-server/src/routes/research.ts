import { Router, type IRouter, type Request, type Response } from "express";
import { supabase } from "../lib/supabase.js";
import {
  referenceText,
  selectCitationCandidates,
  searchCrossrefCitations,
  searchEuropePmcCitations,
  sortCitations,
  type Citation,
} from "../lib/citation-sources.js";
import {
  parseCitationSectionResponse,
  sectionRequiresLiteratureCitations,
} from "../lib/citation-response.js";
import {
  abbreviationsForProposal,
  isEndMatterHeading,
  literatureHeadingForObjective,
  objectiveLinesFromContent,
  orderGenerationTargets,
} from "../lib/proposal-structure.js";

const router: IRouter = Router();

const PROPOSAL_HEADINGS = [
  "Cover page",
  "Certification",
  "Declaration",
  "Dedication",
  "Acknowledgment",
  "Table of Contents",
  "List of Abbreviations and Acronyms",
  "Definition of Terms",
  "Abstract",
  "Chapter One",
  "1.1 Introduction",
  "1.2 Background Information",
  "1.3 Problem Statement",
  "1.4 Justification",
  "1.5 Research Questions",
  "1.6 Broad Objectives",
  "1.6.1 Specific Objectives",
  "1.7 Scope of the Study",
  "1.8 Significance of the Study",
  "1.9 Study Limitations",
  "1.10 Study Delimitation",
  "1.11 Assumptions",
  "1.12 Conceptual framework",
  "Chapter Two: Literature Review",
  "2.1 Overview of the study topic",
  "Chapter Three: Research Methodology",
  "3.0 Overview",
  "3.1 Study Design",
  "3.2 Study Area",
  "3.3 Study Population",
  "3.4 Sampling technique",
  "3.5 Inclusion Criteria",
  "3.6 Exclusion Criteria",
  "3.7 Variables",
  "3.7.1 Dependent variable",
  "3.7.2 Independent Variables",
  "3.8 Sample size determination",
  "3.9 Data collection process",
  "3.10 Data collection tools",
  "3.11 Piloting",
  "3.12 Validity",
  "3.13 Reliability",
  "3.14 Data analysis",
  "3.15 Ethical considerations",
  "References",
  "Appendices",
  "Appendix I: Research Checklist",
  "Appendix II: Budget",
  "Appendix III: Work Plan",
  "Appendix IV: Map of the Study Area",
];

const NON_GENERATED = new Set([
  "Cover page",
  "Certification",
  "Declaration",
  "Table of Contents",
  "List of Abbreviations and Acronyms",
  "Chapter One",
  "Chapter Two: Literature Review",
  "Chapter Three: Research Methodology",
  "3.8 Sample size determination",
  "References",
  "Appendices",
  "Appendix II: Budget",
  "Appendix III: Work Plan",
  "Appendix IV: Map of the Study Area",
]);

type ResearchSection = { id: string; heading: string; content: string; citationIds?: string[] };
type StudyAreaPoint = { latitude: number; longitude: number; label: string };
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
  researchQuestions: string;
  broadObjective: string;
  specificObjectives: string;
  confidenceLevel: 90 | 95 | 99;
  proportionEstimate: number;
  marginOfError: number;
  populationSize: number | null;
  nonresponseRate: number;
  workPlanStartDate: string;
  workPlanDurationMonths: number;
  budgetItems: { item: string; quantity: number; unitCost: number }[];
  mapPoint: StudyAreaPoint | null;
  references: Citation[];
  sections: ResearchSection[];
  status: "draft" | "queued" | "generating" | "ready" | "failed";
  completedSections: number;
  totalSections: number;
  currentSection: string;
  generationError: string;
  updatedAt: string;
};

const activeJobs = new Set<string>();
let lastNominatimRequestAt = 0;
let nominatimQueue: Promise<void> = Promise.resolve();
const mapTileRequestWindows = new Map<string, { startedAt: number; requests: number }>();

function isGenerationTarget(section: ResearchSection) {
  return !NON_GENERATED.has(section.heading);
}

function generationTargetCount(sections: ResearchSection[]) {
  return sections.filter(isGenerationTarget).length;
}

function objectiveLinesFor(project: Pick<ResearchProject, "specificObjectives" | "sections">) {
  const supplied = objectiveLinesFromContent(project.specificObjectives);
  if (supplied.length) return supplied;
  return objectiveLinesFromContent(
    project.sections.find((section) => section.heading === "1.6.1 Specific Objectives")?.content ?? "",
  );
}

function syncLiteratureHeadings(project: ResearchProject) {
  const objectives = objectiveLinesFor(project);
  if (!objectives.length) return;

  const literatureSections = project.sections.filter((section) => /^2\.[234]\s/.test(section.heading));
  if (!literatureSections.length) return;
  const genericHeading = literatureSections.some((section) =>
    /^2\.[234]\s+(?:literature related to\s+)?(?:specific objective|objective)\b/i.test(section.heading),
  );
  if (!genericHeading && literatureSections.some((section) => section.content.trim())) return;

  const firstIndex = project.sections.findIndex((section) => /^2\.[234]\s/.test(section.heading));
  const nextLiterature = objectives.map((objective, index) => {
    const existing = literatureSections[index];
    return {
      id: existing?.id ?? `section-literature-${index + 2}`,
      heading: literatureHeadingForObjective(objective, index),
      content: existing?.content ?? "",
      citationIds: existing?.citationIds ?? [],
    };
  });
  const remaining = project.sections.filter((section) => !/^2\.[234]\s/.test(section.heading));
  remaining.splice(Math.max(0, firstIndex), 0, ...nextLiterature);
  project.sections = remaining;
  project.totalSections = generationTargetCount(project.sections);
}

function asText(value: unknown, max = 4000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseStudyAreaPoint(value: unknown): StudyAreaPoint | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const point = value as Record<string, unknown>;
  const latitude = Number(point.latitude);
  const longitude = Number(point.longitude);
  const label = asText(point.label, 400);
  if (
    !Number.isFinite(latitude)
    || latitude < -90
    || latitude > 90
    || !Number.isFinite(longitude)
    || longitude < -180
    || longitude > 180
    || !label
  ) return null;
  return { latitude, longitude, label };
}

function projectFromRow(row: Record<string, unknown>): ResearchProject {
  const data = (row.project_data ?? {}) as Partial<ResearchProject>;
  const objectiveLines = typeof data.specificObjectives === "string"
    ? data.specificObjectives.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 3)
    : [];
  const sections = Array.isArray(data.sections)
    ? data.sections.map((section) => {
        const match = section.heading.match(/^2\.([234])\s+/i);
        const index = match ? Number(match[1]) - 2 : -1;
        if (
          index < 0
          || !objectiveLines[index]
          || !/literature related to|specific objective/i.test(section.heading)
        ) return section;
        return { ...section, heading: literatureHeadingForObjective(objectiveLines[index], index) };
      })
    : [];
  const project: ResearchProject = {
    ...(data as ResearchProject),
    id: String(row.id),
    status: String(row.status ?? "draft") as ResearchProject["status"],
    completedSections: Number(row.completed_sections) || 0,
    totalSections: Number(row.total_sections) || generationTargetCount(sections),
    currentSection: String(row.current_section ?? ""),
    generationError: String(row.generation_error ?? ""),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    sections,
    mapPoint: parseStudyAreaPoint(data.mapPoint),
    references: Array.isArray(data.references) ? data.references : [],
  };
  syncLiteratureHeadings(project);
  return project;
}

function makeNewProject(body: Record<string, unknown>): Omit<ResearchProject, "id" | "status" | "completedSections" | "totalSections" | "currentSection" | "generationError" | "updatedAt"> {
  const title = asText(body.title, 240);
  const specificObjectives = asText(body.specificObjectives, 3000);
  const objectiveLines = specificObjectives.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 3);
  const headings = [...PROPOSAL_HEADINGS];
  const literatureStart = headings.indexOf("2.1 Overview of the study topic") + 1;
  const literatureObjectives = objectiveLines.length ? objectiveLines : ["", "", ""];
  headings.splice(literatureStart, 0, ...literatureObjectives.map(literatureHeadingForObjective));
  return {
    title,
    studentName: asText(body.studentName, 160),
    admissionNumber: asText(body.admissionNumber, 100),
    course: asText(body.course, 200),
    department: asText(body.department, 200),
    studyLocation: asText(body.studyLocation, 240),
    supervisorName: asText(body.supervisorName, 160),
    studyDesign: asText(body.studyDesign, 240),
    targetPopulation: asText(body.targetPopulation, 500),
    studyPeriodStart: asText(body.studyPeriodStart, 30),
    studyPeriodEnd: asText(body.studyPeriodEnd, 30),
    targetPages: Math.min(100, Math.max(1, Number(body.targetPages) || 40)),
    researchQuestions: asText(body.researchQuestions, 3000),
    broadObjective: asText(body.broadObjective, 1200),
    specificObjectives,
    confidenceLevel: [90, 95, 99].includes(Number(body.confidenceLevel)) ? Number(body.confidenceLevel) as 90 | 95 | 99 : 95,
    proportionEstimate: Math.min(99, Math.max(1, Number(body.proportionEstimate) || 50)),
    marginOfError: Math.min(50, Math.max(1, Number(body.marginOfError) || 5)),
    populationSize: Number(body.populationSize) > 0 ? Math.floor(Number(body.populationSize)) : null,
    nonresponseRate: Math.min(90, Math.max(0, Number(body.nonresponseRate) || 10)),
    workPlanStartDate: asText(body.workPlanStartDate, 30),
    workPlanDurationMonths: Math.min(60, Math.max(1, Number(body.workPlanDurationMonths) || 6)),
    budgetItems: Array.isArray(body.budgetItems)
      ? body.budgetItems.slice(0, 40).map((item) => {
          const row = item as Record<string, unknown>;
          return {
            item: asText(row.item, 160),
            quantity: Math.max(1, Number(row.quantity) || 1),
            unitCost: Math.max(0, Number(row.unitCost) || 0),
          };
        })
      : [],
    mapPoint: parseStudyAreaPoint(body.mapPoint),
    references: [],
    sections: headings.map((heading, index) => ({
      id: `section-${index}-${heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      heading,
      content: "",
      citationIds: [],
    })),
  };
}

function validationError(project: Partial<ResearchProject>): string | null {
  if (typeof project.title !== "string" || !project.title.trim()) return "Add a working title or research topic to continue.";
  if (project.studyPeriodStart && project.studyPeriodEnd && String(project.studyPeriodEnd) < String(project.studyPeriodStart)) {
    return "The study period end date must not come before the start date.";
  }
  if (!Number.isFinite(project.proportionEstimate) || Number(project.proportionEstimate) <= 0 || Number(project.proportionEstimate) >= 100) return "Expected proportion must be above 0 and below 100.";
  if (!Number.isFinite(project.marginOfError) || Number(project.marginOfError) <= 0 || Number(project.marginOfError) >= 100) return "Margin of error must be above 0 and below 100.";
  if (!Number.isFinite(project.nonresponseRate) || Number(project.nonresponseRate) < 0 || Number(project.nonresponseRate) >= 100) return "Nonresponse allowance must be from 0 up to, but not including, 100.";
  if (Array.isArray(project.budgetItems) && project.budgetItems.some((item) => item.item.trim() && (item.quantity <= 0 || item.unitCost < 0))) {
    return "Check the budget items; each needs a positive quantity and a non-negative cost.";
  }
  return null;
}

async function fetchProject(projectId: string, studentId: string) {
  const { data, error } = await supabase
    .from("research_projects")
    .select("*")
    .eq("id", projectId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) throw error;
  return data ? projectFromRow(data as Record<string, unknown>) : null;
}

async function persistProject(project: ResearchProject) {
  const { error } = await supabase
    .from("research_projects")
    .update({
      project_data: project,
      status: project.status,
      completed_sections: project.completedSections,
      total_sections: project.totalSections,
      current_section: project.currentSection,
      generation_error: project.generationError || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", project.id);
  if (error) throw error;
}

function needsSources(heading: string) {
  return sectionRequiresLiteratureCitations(heading);
}

function citationYearRange() {
  const currentYear = new Date().getFullYear();
  return { minimumYear: 1900, currentYear };
}

function calculatedSampleSize(project: ResearchProject) {
  const zValues = { 90: 1.645, 95: 1.96, 99: 2.576 } as const;
  const confidence = project.confidenceLevel in zValues ? project.confidenceLevel : 95;
  const z = zValues[confidence];
  const p = project.proportionEstimate / 100;
  const d = project.marginOfError / 100;
  const n0 = (z * z * p * (1 - p)) / (d * d);
  let base = Math.ceil(n0);
  const lines = [
    "The proposed sample size was calculated using the following parameters.",
    `Confidence level: ${confidence}% (Z = ${z}).`,
    `Expected proportion: ${project.proportionEstimate}%; margin of error: ${project.marginOfError}%.`,
    `Initial sample size using n₀ = Z² × p × (1 − p) ÷ d²: ${n0.toFixed(2)}, rounded up to ${base}.`,
  ];
  if (project.populationSize && project.populationSize > 0) {
    const adjusted = n0 / (1 + (n0 - 1) / project.populationSize);
    base = Math.ceil(adjusted);
    lines.push(`Finite population correction for N = ${project.populationSize}: ${adjusted.toFixed(2)}, rounded up to ${base}.`);
  } else {
    lines.push("Finite-population correction was not applied because no verified eligible-population count was provided.");
  }
  const final = Math.ceil(base / (1 - project.nonresponseRate / 100));
  lines.push(`With a ${project.nonresponseRate}% nonresponse allowance, the proposed sample is ${final} participants.`);
  return lines.join("\n\n");
}

function applyCalculatedSections(project: ResearchProject): ResearchProject {
  const usedCitationIds = new Set(project.sections.flatMap((section) => section.citationIds ?? []));
  const citedReferences = sortCitations(project.references.filter((citation) => usedCitationIds.has(citation.id)));
  const budgetTotal = project.budgetItems.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  const budget = project.budgetItems.length
    ? [
        ...project.budgetItems.map((item) => `${item.item} | ${item.quantity} | KSh ${item.unitCost.toLocaleString("en-KE")} | KSh ${(item.quantity * item.unitCost).toLocaleString("en-KE")}`),
        `TOTAL |  |  | KSh ${budgetTotal.toLocaleString("en-KE")}`,
      ].join("\n")
    : "No budget line items were supplied.";
  const workPlan = project.workPlanStartDate
    ? Array.from({ length: project.workPlanDurationMonths }, (_, index) => {
        const date = new Date(`${project.workPlanStartDate}T00:00:00`);
        date.setMonth(date.getMonth() + index);
        const month = date.toLocaleDateString("en-KE", { month: "long", year: "numeric" });
        const activities = [
          "Proposal refinement and supervisor review",
          "Ethics and institutional permissions",
          "Tool piloting and data collection preparation",
          "Data collection and quality checks",
          "Data analysis and interpretation",
          "Report writing and final review",
        ];
        return `${month}: ${activities[index % activities.length]}`;
      }).join("\n")
    : Array.from({ length: project.workPlanDurationMonths }, (_, index) => {
        const activities = [
          "Proposal refinement and supervisor review",
          "Ethics and institutional permissions",
          "Tool piloting and data collection preparation",
          "Data collection and quality checks",
          "Data analysis and interpretation",
          "Report writing and final review",
        ];
        return `Month ${index + 1}: ${activities[index % activities.length]}`;
      }).join("\n");
  const objectiveLines = project.specificObjectives.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const tableOfContents = project.sections
    .filter((section) => section.heading !== "Table of Contents")
    .map((section) => section.heading)
    .join("\n");
  const calculated: Record<string, string> = {
    "Cover page": [
      project.title,
      project.studentName,
      project.admissionNumber ? `Admission number: ${project.admissionNumber}` : "",
      project.course,
      project.department,
      project.studyLocation ? `Study area: ${project.studyLocation}` : "",
    ].filter(Boolean).join("\n"),
    "Certification": [
      `The undersigned recommend this proposal entitled “${project.title}” for consideration by the Department of ${project.department || "the relevant department"}.`,
      `Submitted by: ${project.studentName || ""}`,
      project.supervisorName ? `Supervisor: ${project.supervisorName}` : "",
      "Supervisor signature: __________________________    Date: __________________________",
      "Head of Department signature: __________________________    Date: __________________________",
    ].filter(Boolean).join("\n\n"),
    "Declaration": [
      "I declare that this proposal is my original work and has not been presented for an academic qualification at another institution.",
      project.studentName ? `Researcher: ${project.studentName}` : "",
      "Signature: __________________________    Date: __________________________",
      project.department,
    ].filter(Boolean).join("\n\n"),
    "Table of Contents": tableOfContents,
    "Chapter One": "Introduction to the study, the research problem, objectives, scope, significance, limitations, and assumptions.",
    "Chapter Two: Literature Review": "Review of literature related to the study topic and each specific objective.",
    "Chapter Three: Research Methodology": "Methods proposed for the study, including design, area, population, sampling, data collection, analysis, and ethics.",
    "List of Abbreviations and Acronyms": abbreviationsForProposal(project),
    "3.8 Sample size determination": calculatedSampleSize(project),
    "References": citedReferences.length ? citedReferences.map(referenceText).join("\n\n") : "",
    "Appendices": "Appendix I: Research Checklist\nAppendix II: Budget\nAppendix III: Work Plan\nAppendix IV: Map of the Study Area",
    "Appendix II: Budget": budget,
    "Appendix III: Work Plan": workPlan,
    "Appendix IV: Map of the Study Area": "",
  };
  if (project.researchQuestions.trim()) {
    calculated["1.5 Research Questions"] = project.researchQuestions.trim();
  }
  if (project.broadObjective.trim()) {
    calculated["1.6 Broad Objectives"] = project.broadObjective.trim();
  }
  if (project.specificObjectives.trim()) {
    calculated["1.6.1 Specific Objectives"] = objectiveLines.join("\n");
  }
  return {
    ...project,
    sections: project.sections.map((section) => Object.hasOwn(calculated, section.heading)
      ? { ...section, content: calculated[section.heading] }
      : section),
  };
}

function proposalContext(project: ResearchProject): string {
  const excluded = new Set([
    "Cover page",
    "Certification",
    "Declaration",
    "Table of Contents",
    "References",
    "List of Abbreviations and Acronyms",
    "Definition of Terms",
  ]);
  const context = project.sections
    .filter((section) => !excluded.has(section.heading) && section.content.trim())
    .map((section) => `${section.heading}\n${section.content.trim()}`)
    .join("\n\n");
  if (context.length <= 16_000) return context;
  return `${context.slice(0, 4_000)}\n\n[Earlier sections omitted for length.]\n\n${context.slice(-12_000)}`;
}

function promptFor(project: ResearchProject, heading: string, sourceReferences: Citation[]) {
  const objectiveList = objectiveLinesFor(project);
  const literatureNo = Number(heading.match(/^2\.([234])/i)?.[1] ?? 0);
  const { minimumYear, currentYear } = citationYearRange();
  const suppliedDetails = [
    ["Course", project.course],
    ["Department", project.department],
    ["Study area", project.studyLocation],
    ["Study design", project.studyDesign],
    ["Target population", project.targetPopulation],
    ["Study period", [project.studyPeriodStart, project.studyPeriodEnd].filter(Boolean).join(" to ")],
    ["Broad objective", project.broadObjective],
    ["Specific objectives", objectiveList.join("; ")],
    ["Research questions", project.researchQuestions],
    ["Calculated sample size", calculatedSampleSize(project)],
  ].filter(([, value]) => typeof value === "string" && value.trim())
    .map(([label, value]) => `${label}: ${value}`);
  const availableReferences = sourceReferences
    .filter((citation) =>
      (citation.source === "Crossref" || citation.source === "Europe PMC")
      && citation.year >= minimumYear
      && citation.year <= currentYear,
    )
    .slice(-12)
    .map((citation) => [
      `ID: ${citation.id}`,
      `${citation.authors.map((author) => author.lastName).join(", ")} (${citation.year})`,
      citation.title,
      citation.journal,
      citation.doi ? `DOI: ${citation.doi}` : "",
      citation.abstract ? `Abstract: ${citation.abstract.slice(0, 900)}` : "",
    ].filter(Boolean).join(" — "))
    .join("\n");
  const isAbbreviations = heading === "List of Abbreviations and Acronyms";
  const isDefinitions = heading === "Definition of Terms";
  const isFramework = heading === "1.12 Conceptual framework";
  const isResearchTool = heading === "Appendix I: Research Checklist";
  const endMatterInstruction = isAbbreviations
    ? "Create a concise list of meaningful acronyms that actually appear in the completed proposal. For each acronym, give its correct full form in the study context, one per line as ACRONYM — Full Term. Do not list ordinary words, guess expansions, or include terms not used in the proposal. If no acronyms appear, say so in one short sentence."
    : isDefinitions
      ? "Define only the most important study-specific concepts appearing in the title, objectives, variables, and completed proposal. Do not define generic research words. Give concise operational definitions relevant to this study."
      : "";
  const frameworkInstruction = isFramework
    ? "Return only a compact diagram data block using exactly these labels: Independent variables: followed by exactly three concise, study-specific categories, one per line prefixed with '- '; then Dependent variable / study outcome: followed by one measurable outcome. Derive each category from the specific objectives and supplied study variables. Do not write an essay, repeat objective sentences, invent population groups, or claim unsupported causation."
    : "";
  const researchToolInstruction = isResearchTool
    ? "Create a usable study-specific data-collection instrument, not a summary of project details. Use a brief respondent introduction, voluntary-consent confirmation, anonymous participant code, clear instructions, numbered questions or record fields with response choices, and a brief mapping from each item to one specific objective. Include an observation or examination checklist only when justified by the stated objectives and design. Do not ask for names, invent clinical tests, laboratory tests, procedures, population groups, or measures that the study does not need. Every item must be answerable by the stated target population or from the stated records."
    : "";
  const goalInstruction = heading === "1.6.1 Specific Objectives"
    ? "Write exactly three specific objectives unless the student supplied a different number. Put one objective per line. Each objective must be measurable, directly address the study title, and fit only the supplied population, setting, dates, and design."
    : heading === "1.6 Broad Objectives"
      ? "Write one broad objective that summarizes the specific objectives and matches the study title, population, setting, and design."
      : heading === "1.5 Research Questions"
        ? `Write exactly one clear research question for each specific objective (${objectiveList.length || "three"} total). Keep the order and scope aligned one-to-one; do not introduce a new population, age group, exposure, or outcome.`
        : "";
  const completedProposal = proposalContext(project);
  const systemPrompt = [
    "You are Sasyna's academic writing assistant for a KMTC research proposal.",
    "Write the requested proposal section in formal academic English. Use future tense for proposed research methods and maintain one coherent study design throughout.",
    "Before drafting, reason carefully through the supplied details, prior sections, and source records. Check that the population, setting, dates, design, objectives, questions, methods, measures, and analysis agree. Resolve conflicts in favor of explicit student-supplied project details; do not silently invent missing facts.",
    "Treat the supplied project details and previously completed sections as the source of truth. Do not add ages, populations, subgroups, dates, sample sizes, tests, institutions, approvals, or procedures that were not supplied or methodologically justified.",
    "Keep the title, objectives, questions, population, setting, study dates, design, variables, sample size, instrument, and analysis consistent across all sections. Do not turn a prevalence study into an incidence study; if the design cannot measure incidence, use prevalence terminology or explain the distinction accurately.",
    "Never claim ethical or institutional approval has already been obtained unless that exact fact was supplied. Describe required approvals as planned, not completed.",
    "Never invent authors, titles, publication details, DOIs, URLs, study findings, local facts, approvals, or signatures.",
    "Use only the real scholarly source records supplied below for citations. For each claim supported by one of those sources, place its exact ID in a marker such as [[CITE:crossref-id]]. Do not add bibliography records; return an empty references array. Do not cite every sentence.",
    "Use supplied abstracts to check relevance. Publication titles alone do not support specific findings or statistics. Do not attribute a result to a source unless the supplied abstract or search result explicitly supports it.",
    needsSources(heading)
      ? "Use the enabled DuckDuckGo MCP search integration to check current information and discover relevant evidence before drafting. Treat search snippets as discovery, not proof of a study result. For scholarly claims, cite only supplied Crossref or Europe PMC records whose metadata and abstract support the claim. Prefer recent, directly relevant evidence. Avoid sources already used in another literature subsection when relevant alternatives exist, and do not repeat a source several times in one subsection."
      : "",
    needsSources(heading)
      ? availableReferences
        ? "Cite relevant supplied records for factual or prior-research claims. Use several distinct sources across the literature review when available, and include at least one relevant citation in this section."
        : "No verified scholarly source records were found. Do not invent citations, authors, statistics, or study findings. State the evidence gap cautiously instead."
      : "Do not include citation markers, author–date citations, or reference records in this section. This includes personal, administrative, objective, project-specific, and methods sections in this proposal format.",
    endMatterInstruction,
    frameworkInstruction,
    researchToolInstruction,
    goalInstruction,
    "Do not write placeholder phrases such as 'to be confirmed', 'to be completed', or square-bracketed missing details. Use only supplied facts and neutral proposal wording where a fact is unavailable.",
    "Return one JSON object with this shape: {\"content\":\"section text with citation markers when relevant\",\"references\":[]}. Do not include Markdown fences or text outside the JSON object.",
    "Do not include the section heading, preamble, or internal instructions in the section content.",
    availableReferences ? `Verified source records for this section:\n${availableReferences}` : "",
    completedProposal ? `Study details and completed proposal context:\n${completedProposal}` : "",
  ].join("\n\n");
  const objective = literatureNo ? objectiveList[literatureNo - 2] || "" : "";
  const userPrompt = [
    `Working title: ${project.title}`,
    suppliedDetails.length
      ? `Additional project details supplied:\n${suppliedDetails.join("\n")}`
      : "No project-specific details beyond the working title were supplied.",
    objective ? `Focus for this literature subsection: ${objective}` : "",
    `Requested proposal section: ${heading}`,
    needsSources(heading)
      ? availableReferences
        ? "Use only the supplied verified source IDs in citation markers. Return no new reference records."
        : "Do not create citation markers or reference records; no verified records were supplied."
      : "Do not add citations or reference records to this section.",
    endMatterInstruction,
  ].filter(Boolean).join("\n\n");
  return { systemPrompt, userPrompt };
}

function parseGeneratedSection(
  raw: string,
  heading: string,
  sourceReferences: Citation[],
  citationsRequired: boolean,
) {
  const { currentYear } = citationYearRange();
  return parseCitationSectionResponse(raw, sourceReferences, citationsRequired, currentYear, heading);
}

function listItemCount(content: string) {
  return content.split(/\r?\n/).filter((line) =>
    /^\s*(?:(?:\(?[ivxlcdm]+\)?|\d+)[.)]|[-*•])\s+/i.test(line),
  ).length;
}

function validateGeneratedSection(heading: string, content: string, project: ResearchProject) {
  if (!content.trim()) throw new Error("The AI returned an empty section.");
  if (/^\s*(?:i apologize|sorry\b|here is the requested proposal section)/i.test(content)
    || /["']content["']\s*:\s*|["']references["']\s*:/i.test(content)) {
    throw new Error("The AI returned wrapper text or raw JSON instead of proposal content.");
  }
  if (/\[(?:\s*(?:to confirm|to be confirmed|insert|replace|tbd|todo|unknown)\b[^\]]*)\]/i.test(content)
    || /\b(?:to be confirmed|to be completed|placeholder text)\b/i.test(content)) {
    throw new Error("The AI left an unresolved placeholder in the section.");
  }
  if (/literature related to specific objective\s+(?:one|two|three|\d+)/i.test(content)) {
    throw new Error("The literature review uses a generic objective heading instead of the study topic.");
  }

  if (heading === "1.6.1 Specific Objectives" && !project.specificObjectives.trim()) {
    const objectives = objectiveLinesFromContent(content);
    if (objectives.length !== 3) {
      throw new Error("The proposal needs exactly three measurable, topic-specific objectives.");
    }
  }
  if (heading === "1.5 Research Questions" && !project.researchQuestions.trim()) {
    const expectedCount = objectiveLinesFor(project).length;
    const questionCount = (content.match(/\?/g) ?? []).length;
    if (expectedCount && questionCount !== expectedCount) {
      throw new Error(`Write one research question for each of the ${expectedCount} specific objectives.`);
    }
  }
  if (heading === "1.12 Conceptual framework") {
    const groups = content.match(/^\s*[-*•]\s+.+$/gm) ?? [];
    if (groups.length !== 3 || !/independent variables\s*:/i.test(content)
      || !/(?:dependent variable|study outcome|outcome)\s*:/i.test(content)) {
      throw new Error("The conceptual framework must contain three study-specific factors and one measurable outcome.");
    }
  }
  if (heading === "Appendix I: Research Checklist") {
    const hasResponseChoices = /\b(?:yes|no|not applicable|select one|tick|circle|response options)\b|[☐□]/i.test(content);
    if (listItemCount(content) < 5 || !/\bconsent\b/i.test(content) || !hasResponseChoices) {
      throw new Error("The data-collection instrument needs consent, numbered study items, and clear response choices.");
    }
    if (/^\s*(?:study title|course|department|broad objective|research questions)\s*:/im.test(content)) {
      throw new Error("The appendix contains project details instead of a usable data-collection instrument.");
    }
  }
}

function suppliedGoalContent(project: ResearchProject, heading: string) {
  if (heading === "1.5 Research Questions") return project.researchQuestions.trim();
  if (heading === "1.6 Broad Objectives") return project.broadObjective.trim();
  if (heading === "1.6.1 Specific Objectives") {
    return objectiveLinesFromContent(project.specificObjectives).join("\n");
  }
  return "";
}

function isLmStudioEndpoint(url: URL) {
  const provider = (process.env.AI_PROVIDER ?? "").trim().toLowerCase();
  if (provider === "openai" || provider === "openai-compatible") return false;
  return provider === "lmstudio"
    || provider === "lm-studio"
    || url.port === "1234"
    || url.hostname.toLowerCase().includes("lmstudio")
    || /\/api\/v1(?:\/|$)/i.test(url.pathname);
}

function lmStudioChatUrl(baseUrl: URL) {
  const url = new URL(baseUrl);
  const basePath = url.pathname
    .replace(/\/+$/, "")
    .replace(/\/(?:api\/v1\/chat|v1\/chat\/completions|api\/v1|v1)$/i, "");
  url.pathname = `${basePath}/api/v1/chat`;
  url.search = "";
  url.hash = "";
  return url;
}

async function requestCompletion(
  baseUrl: URL,
  model: string,
  apiKey: string,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  requireMcpSearch = false,
): Promise<string> {
  const lmStudio = isLmStudioEndpoint(baseUrl);
  const mcpIntegrationId = process.env.AI_MCP_INTEGRATION_ID?.trim() || "mcp/duckduckgo";
  let url: URL;
  if (lmStudio) {
    url = lmStudioChatUrl(baseUrl);
  } else {
    url = new URL(baseUrl);
    const path = url.pathname.replace(/\/+$/, "");
    url.pathname = path.endsWith("/chat/completions")
      ? path
      : `${path}${path.endsWith("/v1") ? "" : "/v1"}/chat/completions`;
    url.search = "";
    url.hash = "";
  }

  const systemPrompt = messages.find((message) => message.role === "system")?.content ?? "";
  const conversation = messages
    .filter((message) => message.role !== "system")
    .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
    .join("\n\n");
  let jsonMode = !lmStudio;
  const post = (includeJsonMode: boolean) => fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify(lmStudio
      ? {
          model,
          input: conversation,
          system_prompt: systemPrompt,
          ...(requireMcpSearch ? { integrations: [mcpIntegrationId] } : {}),
          context_length: Math.max(4096, Number(process.env.AI_CONTEXT_LENGTH) || 8192),
          temperature: 0.2,
          max_output_tokens: 2600,
          stream: false,
          store: false,
        }
      : {
          model,
          temperature: 0.2,
          max_tokens: 2600,
          stream: false,
          ...(includeJsonMode ? { response_format: { type: "json_object" } } : {}),
          messages,
        }),
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await post(jsonMode);
      if (jsonMode && (response.status === 400 || response.status === 422)) {
        const errorBody = await response.clone().text().catch(() => "");
        if (/response[_ ]format|json[_ ]object|json mode|structured output/i.test(errorBody)) {
          jsonMode = false;
          response = await post(false);
        }
      }
    } catch {
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      throw new Error("The drafting service could not be reached. Check its settings and try again.");
    }

    if (response.status === 408 || response.status === 429 || response.status >= 500) {
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
    }
    if (!response.ok) {
      throw new Error(`The drafting service returned HTTP ${response.status}. Check the service settings and try again.`);
    }

    let body: {
      choices?: { message?: { content?: unknown } }[];
      output?: { type?: string; content?: unknown; tool?: string; provider_info?: { plugin_id?: string } }[];
    };
    try {
      body = await response.json() as typeof body;
    } catch {
      throw new Error("The drafting service returned an unreadable response. Try the section again.");
    }
    const output = Array.isArray(body.output) ? body.output : [];
    const toolCalls = output.filter((item) => item.type === "tool_call");
    const usedSearch = toolCalls.some((item) =>
      item.provider_info?.plugin_id === mcpIntegrationId
      || /search|duckduckgo|web/i.test(item.tool ?? ""),
    );
    if (lmStudio && requireMcpSearch && !usedSearch) {
      if (attempt < 2) continue;
      throw new Error(
        `LM Studio did not run the DuckDuckGo MCP search tool. Check that LM Studio 0.4 or newer is reachable from Replit and that ${mcpIntegrationId} is the correct integration ID.`,
      );
    }
    const finalMessage = output
      .filter((item) => item.type === "message" && typeof item.content === "string")
      .at(-1)?.content;
    const responseContent = lmStudio ? finalMessage : body.choices?.[0]?.message?.content;
    const raw = typeof responseContent === "string"
      ? responseContent.trim()
      : Array.isArray(responseContent)
        ? responseContent.map((part) => {
            const item = part && typeof part === "object" ? part as Record<string, unknown> : {};
            return typeof item.text === "string" ? item.text : "";
          }).join("").trim()
        : "";
    if (!raw) throw new Error("The drafting service returned an empty response. Try the section again.");
    return raw;
  }

  throw new Error("The drafting service is temporarily unavailable. Try again in a moment.");
}

async function generateSection(heading: string, project: ResearchProject) {
  const base = process.env.AI_BASE_URL;
  const model = process.env.AI_MODEL;
  const apiKey = process.env.AI_API_KEY;
  if (!base || !model || !apiKey) {
    throw new Error("Research drafting is not configured yet. Add the required private service settings.");
  }

  let url: URL;
  try {
    url = new URL(base);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Unsupported protocol");
  } catch {
    throw new Error("AI_BASE_URL must be a valid HTTP or HTTPS URL.");
  }

  let foundReferences: Citation[] = [];
  let literatureQuery = project.title;
  if (needsSources(heading)) {
    const literatureNumber = Number(heading.match(/^2\.([234])/i)?.[1] ?? 0);
    const objective = objectiveLinesFor(project)[literatureNumber - 2]
      ?? heading.replace(/^\d+(?:\.\d+)*\s*/, "");
    literatureQuery = [project.title, objective].filter(Boolean).join(" ");
    const [crossrefResult, europePmcResult] = await Promise.allSettled([
      searchCrossrefCitations(literatureQuery),
      searchEuropePmcCitations(literatureQuery),
    ]);
    if (crossrefResult.status === "fulfilled") foundReferences.push(...crossrefResult.value);
    else console.warn(`[research] Crossref lookup failed for "${heading}":`, crossrefResult.reason);
    if (europePmcResult.status === "fulfilled") foundReferences.push(...europePmcResult.value);
    else console.warn(`[research] Europe PMC lookup failed for "${heading}":`, europePmcResult.reason);
  }
  const { minimumYear, currentYear } = citationYearRange();
  const previousLiteratureCitations = new Set(
    project.sections
      .filter((section) => section.heading !== heading && /^2\.[234]\s/.test(section.heading))
      .flatMap((section) => section.citationIds ?? []),
  );
  const sourceReferences = selectCitationCandidates(
    [...project.references, ...foundReferences].filter((citation) =>
      (citation.source === "Crossref" || citation.source === "Europe PMC")
      && citation.year >= minimumYear
      && citation.year <= currentYear,
    ),
    literatureQuery,
    previousLiteratureCitations,
    12,
  );
  const prompts = promptFor(project, heading, sourceReferences);
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: prompts.systemPrompt },
    { role: "user", content: prompts.userPrompt },
  ];
  let lastValidationError = "The response did not match the requested section format.";
  const citationsRequired = needsSources(heading) && sourceReferences.length > 0;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const raw = await requestCompletion(
      url,
      model,
      apiKey,
      messages,
      needsSources(heading) && isLmStudioEndpoint(url),
    );
    try {
      const generated = parseGeneratedSection(raw, heading, sourceReferences, citationsRequired);
      validateGeneratedSection(heading, generated.content, project);
      return {
        ...generated,
        references: generated.references.filter((citation) => generated.citedIds.includes(citation.id)),
      };
    } catch (error) {
      lastValidationError = error instanceof Error ? error.message : lastValidationError;
      if (attempt === 2) break;
      messages.push({ role: "assistant", content: raw });
      messages.push({
        role: "user",
        content: `Your last response failed validation: ${lastValidationError} Return corrected section content in the requested JSON object. Cite only the exact supplied Crossref source IDs, and return an empty references array. Do not invent citation details.`,
      });
    }
  }

  console.warn(`[research] AI section response failed validation for "${heading}": ${lastValidationError}`);
  throw new Error(`The AI could not finish "${heading}" after 3 attempts. Last validation issue: ${lastValidationError}. Completed sections are saved; choose Retry / resume to continue.`);
}

async function runGeneration(projectId: string, studentId: string) {
  if (activeJobs.has(projectId)) return;
  activeJobs.add(projectId);
  try {
    let project = await fetchProject(projectId, studentId);
    if (!project) return;
    project.status = "generating";
    project.generationError = "";
    project.totalSections = generationTargetCount(project.sections);
    await persistProject(project);

    for (let generatedCount = 0; generatedCount < 80; generatedCount += 1) {
      project = await fetchProject(projectId, studentId) as ResearchProject;
      if (!project) return;
      const pendingSection = orderGenerationTargets(
        project.sections.filter(isGenerationTarget),
      ).find((section) => !section.content.trim());
      if (!pendingSection) break;
      const heading = pendingSection.heading;
      const suppliedContent = suppliedGoalContent(project, heading);
      if (suppliedContent) {
        project.sections = project.sections.map((section) => section.heading === heading
          ? { ...section, content: suppliedContent, citationIds: [] }
          : section);
        syncLiteratureHeadings(project);
        project.completedSections = project.sections.filter((section) => isGenerationTarget(section) && section.content.trim()).length;
        project.updatedAt = new Date().toISOString();
        await persistProject(project);
        continue;
      }

      project.currentSection = heading;
      project.completedSections = project.sections.filter((item) => isGenerationTarget(item) && item.content.trim()).length;
      await persistProject(project);

      const generated = await generateSection(heading, project);
      project.sections = project.sections.map((item) => item.heading === heading
        ? { ...item, content: generated.content, citationIds: generated.citedIds }
        : item);
      syncLiteratureHeadings(project);
      project.references = [...new Map([...project.references, ...generated.references].map((item) => [item.id, item])).values()];
      project.completedSections = project.sections.filter((item) => isGenerationTarget(item) && item.content.trim()).length;
      project.updatedAt = new Date().toISOString();
      await persistProject(project);
    }

    project = await fetchProject(projectId, studentId) as ResearchProject;
    if (project) {
      if (project.sections.some((section) => isGenerationTarget(section) && !section.content.trim())) {
        throw new Error("The proposal contains too many unfinished sections. Retry or resume to continue.");
      }
      project = applyCalculatedSections(project);
      project.status = "ready";
      project.currentSection = "";
      project.generationError = "";
      project.completedSections = project.sections.filter((item) => isGenerationTarget(item) && item.content.trim()).length;
      await persistProject(project);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proposal generation stopped.";
    console.error("[research] Proposal generation failed:", message);
    const project = await fetchProject(projectId, studentId).catch(() => null);
    if (project) {
      project.status = "failed";
      project.generationError = message.slice(0, 500);
      await persistProject(project).catch((persistError) => console.error("[research] Failed to save generation status:", persistError instanceof Error ? persistError.message : "unknown error"));
    }
  } finally {
    activeJobs.delete(projectId);
  }
}

function requireStudent(req: Request, res: Response) {
  const userId = req.headers["x-user-id"] as string | undefined;
  const role = req.headers["x-user-role"] as string | undefined;
  if (!userId) {
    res.status(401).json({ error: "Sign in to access your research projects." });
    return null;
  }
  if (role !== "student") {
    res.status(403).json({ error: "This workspace is for student accounts." });
    return null;
  }
  return userId;
}

async function waitForNominatimTurn() {
  const turn = nominatimQueue.then(async () => {
    const wait = Math.max(0, 1_100 - (Date.now() - lastNominatimRequestAt));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastNominatimRequestAt = Date.now();
  });
  nominatimQueue = turn.catch(() => undefined);
  await turn;
}

router.get("/research/map/search", async (req, res) => {
  const studentId = requireStudent(req, res);
  if (!studentId) return;
  const query = asText(req.query.q, 200);
  if (query.length < 3) {
    res.status(400).json({ error: "Enter at least three characters to search for a study location." });
    return;
  }

  try {
    await waitForNominatimTurn();
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "3");
    const response = await fetch(url, {
      headers: {
        "User-Agent": "SasynaResearchStudio/1.0 (+https://github.com/sasyna-AI/LOCAL-R-SYSTEM)",
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      res.status(502).json({ error: `Map location search returned HTTP ${response.status}.` });
      return;
    }
    const results = await response.json() as {
      lat?: string;
      lon?: string;
      display_name?: string;
    }[];
    const points = results
      .map((result) => ({
        latitude: Number(result.lat),
        longitude: Number(result.lon),
        label: typeof result.display_name === "string" ? result.display_name.trim().slice(0, 400) : "",
      }))
      .filter((point) =>
        Number.isFinite(point.latitude)
        && point.latitude >= -90
        && point.latitude <= 90
        && Number.isFinite(point.longitude)
        && point.longitude >= -180
        && point.longitude <= 180
        && point.label,
      );
    res.set("Cache-Control", "private, max-age=3600");
    res.json({ points });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Map location search failed.";
    res.status(502).json({ error: message.includes("timeout") ? "Map location search timed out. Try again." : "Map location search is temporarily unavailable. Try again." });
  }
});

router.get("/research/map/tiles/:zoom/:x/:y", async (req, res) => {
  const studentId = requireStudent(req, res);
  if (!studentId) return;
  const zoom = Number(req.params.zoom);
  const x = Number(req.params.x);
  const y = Number(req.params.y);
  if (
    !Number.isInteger(zoom)
    || zoom < 2
    || zoom > 18
    || !Number.isInteger(x)
    || !Number.isInteger(y)
    || x < 0
    || y < 0
    || x >= 2 ** zoom
    || y >= 2 ** zoom
  ) {
    res.status(400).json({ error: "The requested map tile coordinates are invalid." });
    return;
  }

  const now = Date.now();
  const window = mapTileRequestWindows.get(studentId);
  if (!window || now - window.startedAt >= 60_000) {
    mapTileRequestWindows.set(studentId, { startedAt: now, requests: 1 });
  } else if (window.requests >= 60) {
    res.set("Retry-After", "60").status(429).json({ error: "Too many map tiles were requested. Wait a minute and try again." });
    return;
  } else {
    window.requests += 1;
  }

  try {
    const headers: Record<string, string> = {
      "User-Agent": "SasynaResearchStudio/1.0 (+https://github.com/sasyna-AI/LOCAL-R-SYSTEM)",
    };
    const referrer = req.get("referer") || req.get("origin");
    if (referrer) headers.Referer = referrer;
    const etag = req.get("if-none-match");
    const modifiedSince = req.get("if-modified-since");
    if (etag) headers["If-None-Match"] = etag;
    if (modifiedSince) headers["If-Modified-Since"] = modifiedSince;
    const response = await fetch(`https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    const cacheControl = response.headers.get("cache-control") || "public, max-age=604800";
    const responseHeaders: Record<string, string> = {
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
    };
    for (const name of ["etag", "last-modified", "expires"]) {
      const value = response.headers.get(name);
      if (value) responseHeaders[name] = value;
    }
    if (response.status === 304) {
      res.set(responseHeaders).status(304).end();
      return;
    }
    if (!response.ok) {
      res.status(502).json({ error: "The map tile service could not provide this map area." });
      return;
    }
    const image = Buffer.from(await response.arrayBuffer());
    res.set({
      ...responseHeaders,
      "Content-Type": "image/png",
    }).send(image);
  } catch {
    res.status(502).json({ error: "Map tiles are temporarily unavailable. Check your connection and try again." });
  }
});

router.get("/research/projects", async (req, res) => {
  const studentId = requireStudent(req, res);
  if (!studentId) return;
  const { data, error } = await supabase
    .from("research_projects")
    .select("*")
    .eq("student_id", studentId)
    .order("updated_at", { ascending: false });
  if (error) {
    res.status(503).json({ error: "Research storage is not ready. Apply the Sasyna research workspace database migration, then try again." });
    return;
  }
  res.json({ projects: (data ?? []).map((row) => projectFromRow(row as Record<string, unknown>)) });
});

router.post("/research/projects", async (req, res) => {
  const studentId = requireStudent(req, res);
  if (!studentId) return;
  const project = makeNewProject(req.body as Record<string, unknown>);
  const issue = validationError(project);
  if (issue) {
    res.status(400).json({ error: issue });
    return;
  }
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("research_projects")
    .insert({
      student_id: studentId,
      title: project.title,
      project_data: project,
      status: "draft",
      completed_sections: 0,
      total_sections: generationTargetCount(project.sections),
      current_section: null,
      generation_error: null,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error || !data) {
    res.status(503).json({ error: "Could not save the project. Confirm the research workspace migration is applied." });
    return;
  }
  res.status(201).json({ project: projectFromRow(data as Record<string, unknown>) });
});

router.get("/research/projects/:id", async (req, res) => {
  const studentId = requireStudent(req, res);
  if (!studentId) return;
  const project = await fetchProject(req.params.id, studentId).catch(() => null);
  if (!project) {
    res.status(404).json({ error: "Research project not found." });
    return;
  }
  res.json({ project });
});

router.patch("/research/projects/:id", async (req, res) => {
  const studentId = requireStudent(req, res);
  if (!studentId) return;
  const project = await fetchProject(req.params.id, studentId);
  if (!project) {
    res.status(404).json({ error: "Research project not found." });
    return;
  }
  const originalStudyLocation = project.studyLocation;
  const body = req.body as Record<string, unknown>;
  const allowedFields = [
    "title", "studentName", "admissionNumber", "course", "department", "studyLocation",
    "supervisorName", "studyDesign", "targetPopulation", "studyPeriodStart", "studyPeriodEnd",
    "targetPages", "researchQuestions", "broadObjective", "specificObjectives", "confidenceLevel",
    "proportionEstimate", "marginOfError", "populationSize", "nonresponseRate",
    "workPlanStartDate", "workPlanDurationMonths", "budgetItems",
  ] as const;
  for (const field of allowedFields) {
    if (field in body) (project as unknown as Record<string, unknown>)[field] = body[field];
  }
  if ("mapPoint" in body) {
    if (body.mapPoint !== null && !parseStudyAreaPoint(body.mapPoint)) {
      res.status(400).json({ error: "Choose a valid study-area result before saving the map location." });
      return;
    }
    project.mapPoint = parseStudyAreaPoint(body.mapPoint);
  } else if (project.studyLocation !== originalStudyLocation) {
    project.mapPoint = null;
  }
  if (Array.isArray(body.sections)) {
    const incoming = body.sections as ResearchSection[];
    project.sections = project.sections.map((section) => {
      const updated = incoming.find((item) => item.id === section.id);
      return updated && typeof updated.content === "string"
        ? { ...section, content: updated.content.slice(0, 50000), citationIds: section.citationIds }
        : section;
    });
  }
  project.title = asText(project.title, 240);
  project.updatedAt = new Date().toISOString();
  const issue = validationError(project);
  if (issue) {
    res.status(400).json({ error: issue });
    return;
  }
  await persistProject(project);
  res.json({ project });
});

router.post("/research/projects/:id/generate", async (req, res) => {
  const studentId = requireStudent(req, res);
  if (!studentId) return;
  const project = await fetchProject(req.params.id, studentId);
  if (!project) {
    res.status(404).json({ error: "Research project not found." });
    return;
  }
  const issue = validationError(project);
  if (issue) {
    res.status(400).json({ error: issue });
    return;
  }
  if (activeJobs.has(project.id)) {
    res.status(409).json({ error: "This proposal is already being drafted." });
    return;
  }
  if (!process.env.AI_BASE_URL || !process.env.AI_MODEL || !process.env.AI_API_KEY) {
    res.status(503).json({ error: "Research drafting is not configured yet. The project details are saved." });
    return;
  }
  const restartFromScratch = (req.body as Record<string, unknown>)?.restart === true;
  if (restartFromScratch) {
    project.sections = project.sections.map((section) => ({
      ...section,
      content: "",
      citationIds: [],
    }));
    project.references = [];
    project.completedSections = 0;
    project.totalSections = generationTargetCount(project.sections);
    project.currentSection = "";
    project.generationError = "";
  } else if (project.status === "failed" && isEndMatterHeading(project.currentSection)) {
    project.sections = project.sections.map((section) =>
      isEndMatterHeading(section.heading)
        ? { ...section, content: "", citationIds: [] }
        : section,
    );
  }
  project.status = "queued";
  project.generationError = "";
  await persistProject(project);
  void runGeneration(project.id, studentId);
  res.status(202).json({ project: { ...project, status: "generating" } });
});

export async function resumeResearchGenerations() {
  const { data, error } = await supabase
    .from("research_projects")
    .select("id, student_id, status")
    .in("status", ["queued", "generating"]);
  if (error) {
    console.warn("[research] Could not check for interrupted drafts. Apply the research workspace migration if needed.");
    return;
  }
  for (const row of data ?? []) {
    const id = String(row.id);
    const studentId = String(row.student_id);
    if (!activeJobs.has(id)) void runGeneration(id, studentId);
  }
}

export default router;
