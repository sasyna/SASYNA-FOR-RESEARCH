import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  PageNumber,
  Paragraph,
  Packer,
  SectionType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { estimatePageNumbersWith } from "docx/layout";
import { createStudyAreaMap, type StudyAreaPoint } from "./study-map";

type Reference = {
  id: string;
  title: string;
  authors: { lastName: string; initials?: string; firstName?: string }[];
  year: number;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  sourceUrl?: string;
  source?: "Europe PMC" | "Crossref" | "AI-generated";
};

type ProposalSection = {
  id: string;
  heading: string;
  content: string;
  citationIds?: string[];
};

type ProposalProject = {
  title: string;
  studentName: string;
  admissionNumber: string;
  course: string;
  department: string;
  studyLocation: string;
  supervisorName: string;
  sections: ProposalSection[];
  references: Reference[];
  budgetItems: { item: string; quantity: number; unitCost: number }[];
  workPlanStartDate: string;
  workPlanDurationMonths: number;
  mapPoint: StudyAreaPoint | null;
  broadObjective: string;
  specificObjectives: string | string[];
  confidenceLevel: 90 | 95 | 99;
  proportionEstimate: number;
  marginOfError: number;
  populationSize: number | null;
  nonresponseRate: number;
};

const FONT = "Times New Roman";
const BODY_SIZE = 24;
const page = {
  size: { width: 12240, height: 15840 },
  margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 720, footer: 720 },
};

const tableBorders = {
  top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
  left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
  right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
  insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
};

function sectionFor(project: ProposalProject, heading: string) {
  return project.sections.find((section) => section.heading === heading);
}

function authorYear(reference: Reference) {
  const first = reference.authors[0]?.lastName || "Unknown author";
  if (reference.authors.length === 1) return `${first}, ${reference.year}`;
  if (reference.authors.length === 2) {
    return `${first} & ${reference.authors[1].lastName}, ${reference.year}`;
  }
  return `${first} et al., ${reference.year}`;
}

function initials(reference: Reference["authors"][number]) {
  const value = reference.initials || reference.firstName?.split(/\s+/).map((part) => part[0]).join("") || "";
  return value.replace(/[^A-Za-z]/g, "").split("").map((letter) => `${letter}.`).join(" ");
}

function referenceParts(reference: Reference) {
  const names = reference.authors.map((author) => `${author.lastName}, ${initials(author)}`.trim().replace(/,\s*$/, ""));
  let namesText = names[0] || "Author unavailable";
  if (names.length === 2) namesText = `${names[0]}, & ${names[1]}`;
  if (names.length > 2) namesText = `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`;
  const title = reference.title.trim().replace(/[.]+$/, "");
  const parts: { text: string; italics?: boolean }[] = [
    { text: `${namesText} (${reference.year}). ${title}.` },
  ];
  if (reference.journal || reference.volume || reference.issue || reference.pages) {
    parts.push({ text: " " });
    if (reference.journal) parts.push({ text: reference.journal.trim(), italics: true });
    if (reference.volume) {
      parts.push({ text: reference.journal ? ", " : "" });
      parts.push({ text: reference.volume, italics: true });
    }
    if (reference.issue) parts.push({ text: `(${reference.issue})` });
    if (reference.pages) parts.push({ text: `, ${reference.pages}` });
    parts.push({ text: "." });
  }
  const doi = reference.doi?.trim().replace(/^https?:\/\/doi\.org\//i, "");
  const url = doi ? `https://doi.org/${doi}` : reference.sourceUrl;
  if (url) parts.push({ text: ` ${url}` });
  return parts;
}

function cleanSectionContent(project: ProposalProject, heading: string, value: string) {
  const references = new Map(project.references.map((reference) => [reference.id, reference]));
  let content = value.replace(/\[\[CITE:([^\]]+)\]\]/g, (_token, id: string) => {
    const reference = references.get(id.trim());
    return reference ? `(${authorYear(reference)})` : "(citation needs verification)";
  });
  const firstLine = content.trim().split(/\r?\n/, 1)[0]?.trim().toLowerCase();
  if (firstLine === heading.trim().toLowerCase()) {
    content = content.trim().split(/\r?\n/).slice(1).join("\n");
  }
  return content
    .replace(/\r\n?/g, "\n")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function bodyParagraphs(content: string): Paragraph[] {
  return content
    .split(/\n{1,2}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => new Paragraph({
      children: [new TextRun({ text: part, font: FONT, size: BODY_SIZE, color: "000000" })],
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 180, line: 360 },
    }));
}

function centered(text: string, bold = false, size = BODY_SIZE): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 180, after: 180, line: 360 },
    children: [new TextRun({ text, font: FONT, size, bold, color: "000000" })],
  });
}

function listParagraphs(content: string, kind: "abbreviation" | "definition"): Paragraph[] {
  return content
    .split(/\r?\n+/)
    .map((line) => line.replace(/^\s*(?:[-*•]\s+|\d+[.)]\s*)/, "").trim())
    .filter(Boolean)
    .map((line) => {
      const match = kind === "abbreviation"
        ? line.match(/^([A-Z][A-Z0-9&./-]{0,11})\s*(?:–|—|-|:)\s*(.+)$/)
        : line.match(/^(.{1,100}?)(?::|\s+[-–—]\s+)\s*(.+)$/);
      const label = match?.[1].trim() || "";
      const value = match?.[2].trim() || "";
      return new Paragraph({
        children: match
          ? [
              new TextRun({ text: `${label}${kind === "definition" ? ":" : ""}`, font: FONT, size: BODY_SIZE, bold: true, color: "000000" }),
              new TextRun({ text: ` ${kind === "abbreviation" ? "–" : ""} ${value}`.replace(/\s+/g, " ").trimStart(), font: FONT, size: BODY_SIZE, color: "000000" }),
            ]
          : [new TextRun({ text: line, font: FONT, size: BODY_SIZE, color: "000000" })],
        alignment: kind === "definition" ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
        spacing: { after: 180, line: 360 },
        keepLines: true,
      });
    });
}

function pageFooter(): Footer {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: BODY_SIZE, color: "000000" })],
    })],
  });
}

function sectionHeading(text: string, level: typeof HeadingLevel.HEADING_1 | typeof HeadingLevel.HEADING_2, pageBreakBefore = false) {
  return new Paragraph({
    text,
    heading: level,
    pageBreakBefore,
    keepNext: true,
    spacing: { before: 240, after: 120, line: 360 },
  });
}

function tableCell(text: string, bold = false, alignment: typeof AlignmentType[keyof typeof AlignmentType] = AlignmentType.LEFT) {
  return new TableCell({
    margins: { top: 90, bottom: 90, left: 100, right: 100 },
    children: [new Paragraph({
      alignment,
      spacing: { after: 0, line: 300 },
      children: [new TextRun({ text, font: FONT, size: 20, bold, color: "000000" })],
    })],
  });
}

function budgetTable(project: ProposalProject): Table {
  const items = project.budgetItems ?? [];
  const rows = [
    new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: [
        tableCell("Item description", true),
        tableCell("Quantity", true, AlignmentType.RIGHT),
        tableCell("Unit cost (KSh)", true, AlignmentType.RIGHT),
        tableCell("Total cost (KSh)", true, AlignmentType.RIGHT),
      ],
    }),
    ...(items.length
      ? items.map((item) => new TableRow({
          cantSplit: true,
          children: [
            tableCell(item.item),
            tableCell(String(item.quantity), false, AlignmentType.RIGHT),
            tableCell(`KSh ${item.unitCost.toLocaleString("en-KE")}`, false, AlignmentType.RIGHT),
            tableCell(`KSh ${(item.quantity * item.unitCost).toLocaleString("en-KE")}`, false, AlignmentType.RIGHT),
          ],
        }))
      : [new TableRow({ cantSplit: true, children: [tableCell("No budget items were supplied"), tableCell("—"), tableCell("—"), tableCell("—")] })]),
    new TableRow({
      cantSplit: true,
      children: [
        tableCell("Grand total", true),
        tableCell("", true),
        tableCell("", true),
        tableCell(items.length
          ? `KSh ${items.reduce((total, item) => total + item.quantity * item.unitCost, 0).toLocaleString("en-KE")}`
          : "Not calculated", true, AlignmentType.RIGHT),
      ],
    }),
  ];
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [4800, 1000, 1780, 1780],
    borders: tableBorders,
  });
}

function addMonths(value: string, offset: number) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return `Month ${offset + 1}`;
  date.setUTCMonth(date.getUTCMonth() + offset);
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function workPlanTable(project: ProposalProject): Table {
  const duration = Math.max(1, Math.min(10, project.workPlanDurationMonths || 6));
  const phases = [
    { activity: "Proposal development", start: 0, end: 0.22 },
    { activity: "Proposal submission to the institution", start: 0.16, end: 0.30 },
    { activity: "Proposal review and approval", start: 0.22, end: 0.40 },
    { activity: "Proposal defense", start: 0.28, end: 0.40 },
    { activity: "Development of data-collection instruments", start: 0.34, end: 0.52 },
    { activity: "Pre-testing of data-collection instruments", start: 0.44, end: 0.60 },
    { activity: "Submission of the research proposal", start: 0.48, end: 0.60 },
    { activity: "Data collection", start: 0.52, end: 0.78 },
    { activity: "Data analysis", start: 0.72, end: 0.88 },
    { activity: "Development and revision of the research report", start: 0.82, end: 0.97 },
    { activity: "Research defense", start: 0.94, end: 1 },
    { activity: "Final research submission", start: 0.97, end: 1 },
  ];
  const dateLabel = (monthIndex: number) => {
    if (!project.workPlanStartDate) return `Month ${monthIndex + 1}`;
    const date = new Date(`${project.workPlanStartDate}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return `Month ${monthIndex + 1}`;
    date.setUTCMonth(date.getUTCMonth() + monthIndex);
    const month = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(date);
    return `${month}\n${date.getUTCFullYear()}`;
  };
  const timelineCell = (active: boolean) => new TableCell({
    margins: { top: 90, bottom: 90, left: 40, right: 40 },
    borders: tableBorders,
    ...(active ? { shading: { fill: "111111" } } : {}),
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 0, line: 260 },
      children: [new TextRun({ text: active ? " " : "", font: FONT, size: 18, color: "000000" })],
    })],
  });
  const activityWidth = 3600;
  const monthWidth = Math.floor((9360 - activityWidth) / duration);
  const rows = [
    new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: [
        tableCell("Activity", true),
        ...Array.from({ length: duration }, (_, index) => tableCell(dateLabel(index), true, AlignmentType.CENTER)),
      ],
    }),
    ...phases.map((phase) => {
      const startMonth = Math.min(duration - 1, Math.floor(phase.start * duration));
      const endMonth = Math.min(duration - 1, Math.max(startMonth, Math.ceil(phase.end * duration) - 1));
      return new TableRow({
        cantSplit: true,
        children: [
          tableCell(phase.activity),
          ...Array.from({ length: duration }, (_, month) => timelineCell(month >= startMonth && month <= endMonth)),
        ],
      });
    }),
  ];
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [activityWidth, ...Array.from({ length: duration }, () => monthWidth)],
    borders: tableBorders,
  });
}

function frameworkCell(text: string) {
  return new TableCell({
    margins: { top: 150, bottom: 150, left: 160, right: 160 },
    borders: tableBorders,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 120, line: 320 },
      children: [new TextRun({ text, font: FONT, size: 21, color: "000000" })],
    })],
  });
}

function conceptualFrameworkTable(project: ProposalProject): Table {
  const frameworkText = sectionFor(project, "1.12 Conceptual framework")?.content ?? "";
  const independentBlock = frameworkText.match(
    /(?:Independent variables?|Predictor factors?)\s*:\s*([\s\S]*?)(?=\n\s*(?:Dependent variable|Study outcome|Outcome)\b|$)/i,
  )?.[1] ?? "";
  const independentGroups = independentBlock
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s*(?::|—|–)\s*/, 2);
      return parts.length === 2 ? `${parts[0].trim()}: ${parts[1].trim()}` : line;
    });
  const dependentVariable = frameworkText.match(
    /(?:Dependent variable(?:\s*\/\s*study outcome)?|Study outcome|Outcome)\s*:\s*([^\r\n]+)/i,
  )?.[1]?.trim() ?? "";
  const objectiveText = Array.isArray(project.specificObjectives)
    ? project.specificObjectives.join("\n")
    : project.specificObjectives;
  const objectiveFallback = objectiveText
    .split(/\r?\n/)
    .map((line) => line
      .replace(/^\s*(?:[-*•]|\d+[.)]|[ivx]+[.)])\s*/i, "")
      .replace(/^\s*to\s+/i, "")
      .replace(/^(?:assess|determine|describe|identify|examine|evaluate|investigate|explore|measure|estimate)\s+/i, "")
      .trim())
    .filter(Boolean);
  const groups = (independentGroups.length ? independentGroups : objectiveFallback).slice(0, 3);
  const outcomeCell = new TableCell({
    rowSpan: Math.max(1, groups.length),
    margins: { top: 150, bottom: 150, left: 160, right: 160 },
    borders: tableBorders,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 120, line: 320 },
      children: [new TextRun({
        text: dependentVariable || project.title,
        font: FONT,
        size: 21,
        color: "000000",
      })],
    })],
  });
  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  };
  return new Table({
    rows: (groups.length ? groups : [project.title]).map((group, index) => new TableRow({
      cantSplit: true,
      children: [
        ...(index === 0 ? [outcomeCell] : []),
        new TableCell({
          margins: { top: 100, bottom: 100, left: 60, right: 60 },
          borders: noBorders,
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 140, after: 140 },
            children: [new TextRun({ text: "←", font: FONT, size: 32, bold: true, color: "000000" })],
          })],
        }),
        frameworkCell(group),
      ],
    })),
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [4200, 960, 4200],
    borders: tableBorders,
  });
}

function usedReferences(project: ProposalProject) {
  const citedIds = new Set(project.sections.flatMap((section) => [
    ...(section.citationIds ?? []),
    ...[...section.content.matchAll(/\[\[CITE:([^\]]+)\]\]/g)].map((match) => match[1].trim()),
  ]));
  return project.references
    .filter((reference) => citedIds.has(reference.id))
    .sort((left, right) =>
      (left.authors[0]?.lastName ?? "").localeCompare(right.authors[0]?.lastName ?? "", undefined, { sensitivity: "base" })
      || left.year - right.year
      || left.title.localeCompare(right.title),
    );
}

function referenceParagraph(reference: Reference) {
  return new Paragraph({
    children: referenceParts(reference).map((part) => new TextRun({
      text: part.text,
      font: FONT,
      size: BODY_SIZE,
      color: "000000",
      italics: part.italics ?? false,
    })),
    alignment: AlignmentType.LEFT,
    spacing: { after: 180, line: 360 },
    indent: { hanging: 360, left: 720 },
    keepLines: true,
  });
}

const frontMatterHeadings = [
  "Certification",
  "Declaration",
  "Dedication",
  "Acknowledgment",
  "Table of Contents",
  "List of Abbreviations and Acronyms",
  "Definition of Terms",
  "Abstract",
];

function sampleSizeText(project: ProposalProject) {
  const zValues = { 90: 1.645, 95: 1.96, 99: 2.576 } as const;
  const confidence = project.confidenceLevel in zValues ? project.confidenceLevel : 95;
  const z = zValues[confidence];
  const p = project.proportionEstimate / 100;
  const q = 1 - p;
  const d = project.marginOfError / 100;
  const initial = (z * z * p * q) / (d * d);
  let base = Math.ceil(initial);
  const percent = (value: number) => `${Number(value.toFixed(2))}%`;
  const lines = [
    "The sample size for estimating one population proportion was calculated using Cochran’s formula.",
    "n₀ = Z² × p × q ÷ d²",
    `Where: Z = ${z} for a ${confidence}% confidence level; p = ${percent(project.proportionEstimate)}; q = 1 − p = ${percent(q * 100)}; and d = ${percent(project.marginOfError)}.`,
    `Substitution: n₀ = (${z}² × ${p.toFixed(2)} × ${q.toFixed(2)}) ÷ (${d.toFixed(3)}²) = ${initial.toFixed(2)}. The initial sample size is rounded up to ${base}.`,
  ];
  if (project.populationSize && project.populationSize > 0) {
    const finite = initial / (1 + (initial - 1) / project.populationSize);
    base = Math.ceil(finite);
    lines.push(`Because the eligible population is finite (N = ${project.populationSize}), the finite-population correction was applied: n = n₀ ÷ [1 + (n₀ − 1) ÷ N] = ${finite.toFixed(2)}, rounded up to ${base}.`);
  } else {
    lines.push("The finite-population correction was not applied because no verified eligible-population count was provided.");
  }
  const adjusted = base / (1 - project.nonresponseRate / 100);
  const final = Math.ceil(adjusted);
  lines.push(project.nonresponseRate > 0
    ? `A ${percent(project.nonresponseRate)} nonresponse allowance was added: final n = ${base} ÷ (1 − ${project.nonresponseRate / 100}) = ${adjusted.toFixed(2)}, rounded up to ${final} participants.`
    : `The final required sample is ${final} participants.`);
  return lines.join("\n\n");
}

export async function createResearchProposalDocument(
  project: ProposalProject,
  authorizationHeaders: Record<string, string>,
) {
  if (!project.title.trim()) throw new Error("Add the research title before exporting the proposal.");
  if (!project.mapPoint) throw new Error("Select the study location from Edit details before exporting. Appendix IV needs a mapped location.");

  const references = usedReferences(project);
  const title = project.title.trim().toUpperCase() || "RESEARCH PROPOSAL";
  const cover = [
    centered(title, true, 40),
    centered("", true),
    centered("BY", true),
    centered(`NAME: ${project.studentName.trim().toUpperCase()}`, true),
    centered(`ADMISSION: ${project.admissionNumber.trim().toUpperCase()}`, true),
    centered("", true),
    centered(
      `A RESEARCH PROPOSAL SUBMITTED TO THE DEPARTMENT OF ${project.department} IN PARTIAL FULFILLMENT OF THE REQUIREMENTS FOR THE AWARD IN ${project.course}`.toUpperCase(),
      true,
    ),
    centered("", true),
    centered("KENYA MEDICAL TRAINING COLLEGE", true),
    centered("P.O BOX 30195-00100", true),
    centered("NAIROBI", true),
    centered(`${new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(new Date()).toUpperCase()}, ${new Date().getUTCFullYear()}.`, true),
  ];

  const front: (Paragraph | TableOfContents)[] = [];
  for (const heading of frontMatterHeadings) {
    front.push(new Paragraph({
      text: heading,
      heading: HeadingLevel.HEADING_1,
      pageBreakBefore: true,
    }));
    if (heading === "Table of Contents") {
      front[front.length - 1] = new Paragraph({
        alignment: AlignmentType.CENTER,
        pageBreakBefore: true,
        keepNext: true,
        spacing: { before: 180, after: 220, line: 360 },
        children: [new TextRun({ text: "TABLE OF CONTENTS", font: FONT, size: 32, bold: true, color: "000000" })],
      });
      front.push(new TableOfContents("Table of Contents", { headingStyleRange: "1-3", hyperlink: true }));
      continue;
    }

    if (heading === "Certification") {
      front.push(...bodyParagraphs("This research proposal has been read and is recommended for consideration by the internal supervisor named below."));
      front.push(bodyParagraphs("Submitted by:")[0]);
      front.push(bodyParagraphs(`Name: ${project.studentName}`)[0]);
      front.push(bodyParagraphs(`Admission: ${project.admissionNumber}`)[0]);
      front.push(bodyParagraphs("Student signature ______________________________   Date ______________________________")[0]);
      front.push(bodyParagraphs(`Internal supervisor: ${project.supervisorName}`)[0]);
      front.push(bodyParagraphs("SIGNATURE ______________________________   DATE ______________________________")[0]);
      continue;
    }
    if (heading === "Declaration") {
      front.push(...bodyParagraphs("I declare that this research proposal is my original work and has not been presented for an academic qualification at another institution."));
      front.push(bodyParagraphs(`Researcher: ${project.studentName}`)[0]);
      front.push(bodyParagraphs("Student signature ______________________________   Date ______________________________")[0]);
      continue;
    }

    const content = cleanSectionContent(project, heading, sectionFor(project, heading)?.content ?? "");
    if (heading === "List of Abbreviations and Acronyms") {
      front.push(...listParagraphs(content, "abbreviation"));
    } else if (heading === "Definition of Terms") {
      front.push(...listParagraphs(content, "definition"));
    } else {
      front.push(...bodyParagraphs(content));
    }
  }

  const body: (Paragraph | Table)[] = [];
  for (const section of project.sections) {
    const sourceHeading = section.heading;
    const isContainerHeading = sourceHeading === "Chapter One"
      || sourceHeading.startsWith("Chapter Two")
      || sourceHeading.startsWith("Chapter Three")
      || sourceHeading === "Appendices";
    if (["Cover page", ...frontMatterHeadings, "Appendices"].includes(sourceHeading)) continue;

    const isMajorHeading = sourceHeading === "Chapter One"
      || sourceHeading.startsWith("Chapter Two")
      || sourceHeading.startsWith("Chapter Three")
      || sourceHeading === "References"
      || sourceHeading.startsWith("Appendix");
    if (isMajorHeading) {
      body.push(sectionHeading(sourceHeading, HeadingLevel.HEADING_1, true));
    } else if (!isContainerHeading) {
      body.push(sectionHeading(sourceHeading, HeadingLevel.HEADING_2));
    }

    if (sourceHeading === "3.8 Sample size determination") {
      body.push(...bodyParagraphs(sampleSizeText(project)));
    } else if (sourceHeading === "References") {
      body.push(...references.map(referenceParagraph));
      if (project.mapPoint) {
        body.push(...bodyParagraphs(
          "OpenStreetMap contributors. OpenStreetMap [Map]. Map data © OpenStreetMap contributors, licensed under the Open Database License (ODbL). https://www.openstreetmap.org/copyright",
        ));
      }
    } else if (sourceHeading === "Appendix II: Budget") {
      body.push(...bodyParagraphs("For each budget item, line total = quantity × unit cost. The grand total is the sum of all line totals. These values use the costs entered in Project details."));
      body.push(budgetTable(project));
    } else if (sourceHeading === "Appendix III: Work Plan") {
      body.push(workPlanTable(project));
    } else if (sourceHeading === "Appendix IV: Map of the Study Area") {
      const map = await createStudyAreaMap(project.mapPoint, authorizationHeaders);
      body.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: 120 },
        keepNext: true,
        children: [new ImageRun({
          data: new Uint8Array(await map.arrayBuffer()),
          type: "png",
          transformation: { width: 624, height: 416 },
        })],
      }));
    } else if (sourceHeading === "1.12 Conceptual framework") {
      body.push(conceptualFrameworkTable(project));
    } else if (!isContainerHeading) {
      body.push(...bodyParagraphs(cleanSectionContent(project, sourceHeading, section.content)));
    }
  }

  const doc = new Document({
    creator: "SASYNA – The World of Research",
    title: project.title,
    description: "KMTC research proposal with source-linked citations and appendices.",
    features: { updateFields: true },
    pageNumbers: estimatePageNumbersWith({ guess: true }),
    styles: {
      default: {
        document: { run: { font: FONT, size: BODY_SIZE, color: "000000" }, paragraph: { alignment: AlignmentType.JUSTIFIED, spacing: { line: 360 } } },
      },
      paragraphStyles: [
        {
          id: "Normal",
          name: "Normal",
          run: { font: FONT, size: BODY_SIZE, color: "000000" },
          paragraph: { alignment: AlignmentType.JUSTIFIED, spacing: { after: 180, line: 360 } },
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: FONT, size: 32, bold: true, color: "000000" },
          paragraph: { alignment: AlignmentType.LEFT, spacing: { before: 360, after: 180, line: 360 }, keepNext: true },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: FONT, size: 28, bold: true, color: "000000" },
          paragraph: { alignment: AlignmentType.LEFT, spacing: { before: 240, after: 120, line: 360 }, keepNext: true },
        },
        { id: "TOC1", name: "TOC 1", run: { font: FONT, size: BODY_SIZE, color: "000000" }, paragraph: { spacing: { after: 80, line: 360 } } },
        { id: "TOC2", name: "TOC 2", run: { font: FONT, size: BODY_SIZE, color: "000000" }, paragraph: { spacing: { after: 60, line: 360 }, indent: { left: 360 } } },
        { id: "TOC3", name: "TOC 3", run: { font: FONT, size: BODY_SIZE, color: "000000" }, paragraph: { spacing: { after: 40, line: 360 }, indent: { left: 720 } } },
      ],
    },
    sections: [
      {
        properties: { page, type: SectionType.NEXT_PAGE },
        children: cover,
      },
      {
        properties: { page: { ...page, pageNumbers: { start: 1, formatType: "lowerRoman" } }, type: SectionType.NEXT_PAGE },
        footers: { default: pageFooter() },
        children: front,
      },
      {
        properties: { page: { ...page, pageNumbers: { start: 1, formatType: "decimal" } }, type: SectionType.NEXT_PAGE },
        footers: { default: pageFooter() },
        children: body.length ? body : [new Paragraph("Proposal content is empty.")],
      },
    ],
  });
  return Packer.toBlob(doc);
}

export function downloadProposalDocument(blob: Blob, title: string) {
  const name = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "sasyna-research-proposal";
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name}.docx`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
