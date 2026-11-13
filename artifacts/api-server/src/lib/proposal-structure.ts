export const END_MATTER_HEADINGS = [
  "List of Abbreviations and Acronyms",
  "Definition of Terms",
] as const;

const endMatterHeadingSet = new Set<string>(END_MATTER_HEADINGS);
const goalHeadingPriority = [
  "1.6.1 Specific Objectives",
  "1.6 Broad Objectives",
  "1.5 Research Questions",
];

const knownAbbreviations: Record<string, string> = {
  BMI: "Body Mass Index",
  DVT: "Deep Vein Thrombosis",
  GCP: "Good Clinical Practice",
  IMILN: "Interlocking Intramedullary Locking Nail",
  IMN: "Intramedullary Nailing",
  ICH: "International Council for Harmonisation",
  KEMRI: "Kenya Medical Research Institute",
  KMTC: "Kenya Medical Training College",
  KNBS: "Kenya National Bureau of Statistics",
  KSH: "Kitengela Sub-County Hospital",
  NACOSTI: "National Commission for Science, Technology and Innovation",
  NOF: "Neck of Femur",
  ORIF: "Open Reduction and Internal Fixation",
  ROM: "Range of Motion",
  SPSS: "Statistical Package for the Social Sciences",
  WHO: "World Health Organization",
};

export function isEndMatterHeading(heading: string): boolean {
  return endMatterHeadingSet.has(heading);
}

export function objectiveLinesFromContent(value: string): string[] {
  return value
    .split(/\r?\n+/)
    .map((line) => line
      .replace(/^\s*(?:#{1,6}\s*)?/, "")
      .replace(/^\s*(?:(?:\(?[ivxlcdm]+\)?|\d+)[.)]|[-*•])\s*/i, "")
      .replace(/\*\*/g, "")
      .trim())
    .filter((line) =>
      line.length > 8
      && !/^(?:specific objectives|objectives|objective)\b/i.test(line)
      && /^(?:to\s+|assess\b|determine\b|describe\b|identify\b|examine\b|evaluate\b|investigate\b|explore\b|measure\b|estimate\b)/i.test(line),
    )
    .slice(0, 3);
}

export function literatureHeadingForObjective(objective: string, index: number): string {
  const cleaned = objective
    .replace(/^\s*(?:\d+[\.\)]|[ivx]+[\.\)]|[-*•])\s*/i, "")
    .replace(/^\s*to\s+/i, "")
    .replace(/^(?:assess|determine|describe|identify|examine|evaluate|investigate|explore|measure|estimate)\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/[.?!]+$/, "")
    .trim();
  const title = cleaned
    ? `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`
    : "Evidence on the study topic";
  return `2.${index + 2} ${title.slice(0, 120)}`;
}

export function abbreviationsForProposal(project: {
  title: string;
  course?: string;
  department?: string;
  studyLocation?: string;
  specificObjectives?: string;
  researchQuestions?: string;
  broadObjective?: string;
  sections: { heading: string; content: string }[];
}): string {
  const body = [
    project.title,
    project.course,
    project.department,
    project.studyLocation,
    project.specificObjectives,
    project.researchQuestions,
    project.broadObjective,
    ...project.sections
      .filter((section) => !isEndMatterHeading(section.heading) && section.heading !== "References")
      .map((section) => section.content),
  ].filter(Boolean).join("\n");
  const used = new Set(body.match(/\b[A-Z][A-Z0-9&/-]{1,14}\b/g) ?? []);
  const definitions = new Map<string, string>();

  for (const [acronym, expansion] of Object.entries(knownAbbreviations)) {
    if (used.has(acronym)) definitions.set(acronym, expansion);
  }

  const ignoredWords = new Set(["a", "an", "and", "for", "in", "of", "on", "the", "to"]);
  for (const match of body.matchAll(/\b([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){1,10})\s+\(([A-Z][A-Z0-9&/-]{1,14})\)/g)) {
    const phrase = match[1];
    const acronym = match[2];
    const initials = phrase
      .split(/\s+/)
      .filter((word) => !ignoredWords.has(word.toLowerCase()))
      .map((word) => word[0])
      .join("")
      .toUpperCase();
    if (initials === acronym && used.has(acronym)) {
      definitions.set(acronym, phrase);
    }
  }

  const lines = [...definitions.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([acronym, expansion]) => `${acronym} — ${expansion}`);
  return lines.length
    ? lines.join("\n")
    : "No abbreviations or acronyms are used in the proposal.";
}

/**
 * Keep end-matter sections in their document positions, but generate them
 * after all other sections so the model can use the completed proposal.
 */
export function orderGenerationTargets<T extends { heading: string }>(sections: T[]): T[] {
  const goalSections = goalHeadingPriority
    .map((heading) => sections.find((section) => section.heading === heading))
    .filter((section): section is T => Boolean(section));
  const prioritizedHeadings = new Set(goalSections.map((section) => section.heading));
  return [
    ...goalSections,
    ...sections.filter((section) =>
      !prioritizedHeadings.has(section.heading) && !isEndMatterHeading(section.heading),
    ),
    ...sections.filter((section) => isEndMatterHeading(section.heading)),
  ];
}
