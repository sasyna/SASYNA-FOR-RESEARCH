export type CitationAuthor = {
  lastName: string;
  firstName?: string;
  initials?: string;
};

export type Citation = {
  id: string;
  title: string;
  authors: CitationAuthor[];
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

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function firstText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return firstText(value[0]);
  return "";
}

function publishedYear(work: Record<string, unknown>): number | null {
  for (const field of ["published-print", "published-online", "issued"]) {
    const date = record(work[field]);
    const dateParts = date["date-parts"];
    if (!Array.isArray(dateParts) || !Array.isArray(dateParts[0])) continue;
    const year = Number(dateParts[0][0]);
    if (Number.isInteger(year)) return year;
  }
  return null;
}

/**
 * Convert Crossref metadata into citation records. These records identify
 * catalogued publications; they do not by themselves prove a claim.
 */
export function parseCrossrefResponse(
  payload: unknown,
  currentYear = new Date().getFullYear(),
): Citation[] {
  const message = record(record(payload).message);
  const items = Array.isArray(message.items) ? message.items : [];
  const seen = new Set<string>();
  const results: Citation[] = [];

  for (const value of items) {
    const work = record(value);
    const title = firstText(work.title);
    const year = publishedYear(work);
    const authors = (Array.isArray(work.author) ? work.author : [])
      .map((entry) => {
        const author = record(entry);
        const lastName = typeof author.family === "string" ? author.family.trim() : "";
        const firstName = typeof author.given === "string" ? author.given.trim() : "";
        return lastName ? { lastName, firstName: firstName || undefined } : null;
      })
      .filter((author): author is NonNullable<typeof author> => author !== null)
      .slice(0, 20);
    const doi = typeof work.DOI === "string" ? work.DOI.trim() : "";
    if (!title || !authors.length || !year || year < 1900 || year > currentYear) continue;

    const signature = `${doi.toLowerCase()}|${title.toLowerCase()}|${year}`;
    if (seen.has(signature)) continue;
    seen.add(signature);

    results.push({
      id: `crossref-${doi ? doi.toLowerCase().replace(/[^a-z0-9]+/g, "-") : stableHash(signature)}`,
      title,
      authors,
      year,
      journal: firstText(work["container-title"]) || undefined,
      volume: typeof work.volume === "string" ? work.volume : undefined,
      issue: typeof work.issue === "string" ? work.issue : undefined,
      pages: typeof work.page === "string" ? work.page : undefined,
      doi: doi || undefined,
      sourceUrl: doi ? `https://doi.org/${doi}` : undefined,
      source: "Crossref",
    });
  }

  return results;
}

/**
 * Europe PMC provides abstracts alongside publication metadata, which lets
 * the drafting model check whether a paper is relevant before citing it.
 */
export function parseEuropePmcResponse(
  payload: unknown,
  currentYear = new Date().getFullYear(),
): Citation[] {
  const resultList = record(record(payload).resultList);
  const items = Array.isArray(resultList.result) ? resultList.result : [];
  const seen = new Set<string>();
  const results: Citation[] = [];

  for (const value of items) {
    const article = record(value);
    const title = typeof article.title === "string" ? article.title.trim() : "";
    const publicationDate = typeof article.firstPublicationDate === "string" ? article.firstPublicationDate : "";
    const year = Number(publicationDate.slice(0, 4) || article.pubYear);
    const authorList = record(article.authorList);
    const authors = (Array.isArray(authorList.author) ? authorList.author : [])
      .map((entry) => {
        const author = record(entry);
        const lastName = typeof author.lastName === "string" ? author.lastName.trim() : "";
        const firstName = typeof author.firstName === "string" ? author.firstName.trim() : "";
        const initials = typeof author.initials === "string" ? author.initials.trim() : "";
        return lastName ? { lastName, firstName: firstName || undefined, initials: initials || undefined } : null;
      })
      .filter((author): author is NonNullable<typeof author> => author !== null)
      .slice(0, 20);
    const doi = typeof article.doi === "string" ? article.doi.trim() : "";
    const pmid = typeof article.pmid === "string" ? article.pmid.trim() : "";
    const pmcid = typeof article.pmcid === "string" ? article.pmcid.trim() : "";
    const journalInfo = record(article.journalInfo);
    const journal = record(journalInfo.journal);
    const signature = `${doi.toLowerCase()}|${title.toLowerCase()}|${year}`;
    if (!title || !authors.length || !Number.isInteger(year) || year < 1900 || year > currentYear || seen.has(signature)) continue;
    seen.add(signature);

    results.push({
      id: `europepmc-${doi ? doi.toLowerCase().replace(/[^a-z0-9]+/g, "-") : pmid || stableHash(signature)}`,
      title,
      authors,
      year,
      journal: typeof journal.title === "string" ? journal.title.trim() || undefined : undefined,
      volume: typeof journalInfo.volume === "string" ? journalInfo.volume : undefined,
      issue: typeof journalInfo.issue === "string" ? journalInfo.issue : undefined,
      pages: typeof journalInfo.pageInfo === "string" ? journalInfo.pageInfo : undefined,
      doi: doi || undefined,
      pmid: pmid || undefined,
      pmcid: pmcid || undefined,
      abstract: typeof article.abstractText === "string"
        ? article.abstractText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1200) || undefined
        : undefined,
      sourceUrl: pmcid
        ? `https://europepmc.org/articles/${pmcid}`
        : pmid
          ? `https://europepmc.org/article/MED/${pmid}`
          : doi
            ? `https://doi.org/${doi}`
            : undefined,
      source: "Europe PMC",
    });
  }

  return results;
}

export async function searchEuropePmcCitations(
  query: string,
  currentYear = new Date().getFullYear(),
): Promise<Citation[]> {
  const url = new URL("https://www.ebi.ac.uk/europepmc/webservices/rest/search");
  url.searchParams.set("query", query.slice(0, 500));
  url.searchParams.set("format", "json");
  url.searchParams.set("resultType", "core");
  url.searchParams.set("pageSize", "12");

  const response = await fetch(url, {
    headers: { "User-Agent": "Sasyna Research Proposal/1.0 (scholarly evidence lookup)" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error(`Europe PMC returned HTTP ${response.status}.`);
  }
  return parseEuropePmcResponse(await response.json(), currentYear);
}

export async function searchCrossrefCitations(
  query: string,
  currentYear = new Date().getFullYear(),
): Promise<Citation[]> {
  const url = new URL("https://api.crossref.org/works");
  url.searchParams.set("query.bibliographic", query.slice(0, 500));
  url.searchParams.set("rows", "16");
  url.searchParams.set(
    "select",
    "DOI,title,author,published-print,published-online,issued,container-title,volume,issue,page",
  );

  const response = await fetch(url, {
    headers: { "User-Agent": "Sasyna Research Proposal/1.0 (citation metadata lookup)" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error(`Crossref returned HTTP ${response.status}.`);
  }
  return parseCrossrefResponse(await response.json(), currentYear);
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function citationSignature(citation: Citation): string {
  const title = citation.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const authors = citation.authors
    .map((author) => author.lastName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())
    .join("|");
  return `${citation.year}|${authors}|${title}`;
}

export function syntheticCitationId(citation: Citation): string {
  const signature = citationSignature(citation);
  const slug = citation.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36);
  return `synthetic-${citation.year}-${slug}-${stableHash(signature)}`;
}

export function sortCitations(citations: Citation[]): Citation[] {
  return [...citations].sort((left, right) => {
    const authorOrder = (left.authors[0]?.lastName ?? "").localeCompare(
      right.authors[0]?.lastName ?? "",
      undefined,
      { sensitivity: "base" },
    );
    return authorOrder || left.year - right.year || left.title.localeCompare(right.title);
  });
}

export function selectCitationCandidates(
  citations: Citation[],
  query: string,
  previouslyUsedIds: Set<string>,
  limit = 12,
): Citation[] {
  const ignoredWords = new Set([
    "about", "among", "and", "from", "into", "management", "patients", "study", "the", "with",
  ]);
  const terms = query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  const queryTerms = [...new Set(terms.filter((term) => !ignoredWords.has(term)))];
  const unique = new Map<string, Citation>();
  for (const citation of citations) {
    const signature = citationSignature(citation);
    if (!unique.has(signature)) unique.set(signature, citation);
  }

  return [...unique.values()]
    .map((citation) => {
      const searchable = `${citation.title} ${citation.journal ?? ""} ${citation.abstract ?? ""}`.toLowerCase();
      const relevance = queryTerms.reduce((score, term) => score + (searchable.includes(term) ? 1 : 0), 0);
      return {
        citation,
        relevance,
        used: previouslyUsedIds.has(citation.id),
      };
    })
    .sort((left, right) =>
      Number(left.used) - Number(right.used)
      || right.relevance - left.relevance
      || right.citation.year - left.citation.year
      || left.citation.title.localeCompare(right.citation.title),
    )
    .slice(0, Math.max(1, limit))
    .map(({ citation }) => citation);
}

export function authorYear(citation: Citation): string {
  const author = citation.authors.length > 2
    ? `${citation.authors[0]?.lastName} et al.`
    : citation.authors.map((item) => item.lastName).join(" & ");
  return `(${author}, ${citation.year})`;
}

export function referenceText(citation: Citation): string {
  const authors = citation.authors.map((author) => {
    const initials = author.initials
      || author.firstName?.split(/\s+/).map((part) => `${part[0]}.`).join(" ")
      || "";
    return `${author.lastName}, ${initials}`.trim().replace(/,\s*$/, "");
  });
  const authorText = authors.length <= 1
    ? authors.join("")
    : authors.length === 2
      ? `${authors[0]}, & ${authors[1]}`
      : `${authors.slice(0, -1).join(", ")}, & ${authors[authors.length - 1]}`;
  const journalDetails = [
    citation.journal,
    citation.volume ? `${citation.volume}${citation.issue ? `(${citation.issue})` : ""}` : "",
    citation.pages,
  ].filter(Boolean).join(", ");
  const url = citation.doi ? `https://doi.org/${citation.doi}` : citation.sourceUrl;
  return `${authorText} (${citation.year}). ${citation.title}.${journalDetails ? ` ${journalDetails}.` : ""}${url ? ` ${url}` : ""}`;
}
