import {
  authorYear,
  type Citation,
} from "./citation-sources.js";

export function sectionRequiresLiteratureCitations(heading: string): boolean {
  return /^(?:1\.[1-4]|2\.\d+)(?:\b|$)/i.test(heading.trim());
}

function extractJsonObjects(raw: string): string[] {
  const candidates: string[] = [];

  for (let start = 0; start < raw.length; start += 1) {
    if (raw[start] !== "{") continue;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < raw.length; index += 1) {
      const char = raw[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === "\"") inString = false;
        continue;
      }
      if (char === "\"") inString = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          candidates.push(raw.slice(start, index + 1));
          start = index;
          break;
        }
      }
    }
  }

  return candidates;
}

function parseResponseObject(raw: string): Record<string, unknown> {
  for (const candidate of extractJsonObjects(raw)) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try another complete object in case the model added a non-JSON preamble.
    }
  }
  throw new Error("The AI returned malformed citation JSON.");
}

const modelWrapperLine =
  /^(?:here\s+(?:is|are)\b.*(?:section|proposal|answer|result)|i\s+apolog(?:ize|ise)\b.*|sorry\b.*|revised\s+(?:proposal\s+)?section\b.*|the\s+requested\s+section\b.*)\s*:?$/i;

function unwrapModelContent(content: string, heading?: string): string {
  let cleaned = content.trim();
  for (let depth = 0; depth < 5; depth += 1) {
    try {
      const nested = parseResponseObject(cleaned);
      if (typeof nested.content === "string" && nested.content.trim() !== cleaned) {
        cleaned = nested.content.trim();
        continue;
      }
    } catch {
      // The model may have returned ordinary prose rather than a nested JSON envelope.
    }
    break;
  }
  cleaned = cleaned
    .replace(/^```(?:text|markdown|json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const lines = cleaned.split(/\r?\n/);
  while (lines.length && (!lines[0].trim() || modelWrapperLine.test(lines[0].trim()))) {
    lines.shift();
  }
  cleaned = lines.join("\n").trim();
  if (heading) {
    cleaned = cleaned.replace(new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n+`, "i"), "");
  }
  return cleaned.trim();
}

function assertNoUnresolvedPlaceholder(content: string) {
  if (/\[(?:\s*(?:to confirm|to be confirmed|insert|replace|tbd|todo|unknown)\b[^\]]*)\]/i.test(content)
    || /\b(?:to be confirmed|to be completed|insert (?:name|date|details) here|placeholder text)\b/i.test(content)) {
    throw new Error("The AI left an unresolved placeholder in the section.");
  }
}

function cleanCitationFreeText(content: string, heading?: string): string {
  const cleaned = unwrapModelContent(content, heading)
    .replace(/\[\[CITE:[^\]]*\]\]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  assertNoUnresolvedPlaceholder(cleaned);
  return cleaned;
}

function plainTextFromResponse(raw: string, heading?: string): string {
  return cleanCitationFreeText(raw, heading);
}

export type ParsedCitationSection = {
  content: string;
  citedIds: string[];
  references: Citation[];
};

export function parseCitationSectionResponse(
  raw: string,
  existingReferences: Citation[],
  citationsRequired: boolean,
  _currentYear = new Date().getFullYear(),
  heading?: string,
): ParsedCitationSection {
  let result: Record<string, unknown>;
  try {
    result = parseResponseObject(raw);
  } catch (error) {
    if (citationsRequired) throw error;
    const content = plainTextFromResponse(raw, heading);
    if (!content) throw new Error("The AI returned an empty section.");
    return { content, citedIds: [], references: [] };
  }

  const content = typeof result.content === "string"
    ? unwrapModelContent(result.content, heading)
    : "";
  if (!citationsRequired) {
    const plainContent = cleanCitationFreeText(content || plainTextFromResponse(raw, heading), heading);
    if (!plainContent) throw new Error("The AI returned an empty section.");
    return { content: plainContent, citedIds: [], references: [] };
  }
  if (!content) throw new Error("The AI returned an empty section.");
  assertNoUnresolvedPlaceholder(content);

  if (Array.isArray(result.references) && result.references.length > 0) {
    throw new Error("The AI added reference details instead of using the supplied Crossref records.");
  }

  const availableReferences = new Map(
    existingReferences
      .filter((citation) => citation.source === "Crossref" || citation.source === "Europe PMC")
      .map((citation) => [citation.id, citation]),
  );
  const citedSources = new Map<string, Citation>();
  const renderedContent = content.replace(/\[\[CITE:([^\]]+)\]\]/g, (_marker, rawId: string) => {
    const citation = availableReferences.get(rawId.trim());
    if (!citation) throw new Error("The AI returned a citation marker without a matching reference.");
    citedSources.set(citation.id, citation);
    return authorYear(citation);
  });

  if (renderedContent.includes("[[CITE:")) {
    throw new Error("The AI returned an incomplete citation marker.");
  }
  if (citationsRequired && citedSources.size === 0) {
    throw new Error("This section needs at least one matching citation and reference.");
  }
  return {
    content: renderedContent,
    citedIds: [...citedSources.keys()],
    references: [...citedSources.values()],
  };
}
