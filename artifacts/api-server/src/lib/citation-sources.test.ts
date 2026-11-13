import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseCrossrefResponse,
  referenceText,
  sortCitations,
  syntheticCitationId,
  type Citation,
} from "./citation-sources.js";

const citation: Citation = {
  id: "generated-ref",
  title: "Interlocking nailing outcomes in femoral fractures",
  authors: [{ lastName: "Mwangi", firstName: "Jane A" }, { lastName: "Otieno", firstName: "Peter" }],
  year: 2014,
  journal: "East African Orthopaedic Journal",
  volume: "8",
  issue: "2",
  pages: "20–27",
  source: "AI-generated",
};

test("synthetic reference IDs are stable and APA-style references include author initials", () => {
  assert.equal(syntheticCitationId(citation), syntheticCitationId({ ...citation, id: "different-model-id" }));
  assert.match(syntheticCitationId(citation), /^synthetic-2014-/);
  assert.equal(
    referenceText(citation),
    "Mwangi, J. A., & Otieno, P. (2014). Interlocking nailing outcomes in femoral fractures. East African Orthopaedic Journal, 8(2), 20–27.",
  );
});

test("reference lists sort alphabetically by first author", () => {
  const laterAuthor = { ...citation, id: "z", authors: [{ lastName: "Zulu" }] };
  const earlierAuthor = { ...citation, id: "a", authors: [{ lastName: "Adams" }] };

  assert.deepEqual(sortCitations([laterAuthor, earlierAuthor]).map((item) => item.id), ["a", "z"]);
});

test("Crossref metadata is normalized into source-linked citation records", () => {
  const records = parseCrossrefResponse({
    message: {
      items: [{
        DOI: "10.1000/REAL-DOI",
        title: ["Interlocking nailing outcomes"],
        author: [{ family: "Otieno", given: "Jane A." }, { family: "Kamau", given: "Peter" }],
        "published-print": { "date-parts": [[2022, 5, 1]] },
        "container-title": ["Journal of Orthopaedic Research"],
        volume: "12",
        issue: "3",
        page: "20-29",
      }],
    },
  }, 2026);

  assert.equal(records.length, 1);
  assert.equal(records[0]?.id, "crossref-10-1000-real-doi");
  assert.equal(records[0]?.source, "Crossref");
  assert.equal(records[0]?.year, 2022);
  assert.equal(records[0]?.authors[0]?.lastName, "Otieno");
  assert.equal(records[0]?.sourceUrl, "https://doi.org/10.1000/REAL-DOI");
});

test("Crossref parsing skips future, incomplete, and duplicate records", () => {
  const records = parseCrossrefResponse({
    message: {
      items: [
        {
          DOI: "10.1000/future",
          title: ["Future source"],
          author: [{ family: "Doe" }],
          issued: { "date-parts": [[2027]] },
        },
        {
          DOI: "10.1000/no-author",
          title: ["Missing author"],
          issued: { "date-parts": [[2020]] },
        },
        {
          DOI: "10.1000/valid",
          title: ["Valid source"],
          author: [{ family: "Smith" }],
          issued: { "date-parts": [[2020]] },
        },
        {
          DOI: "10.1000/valid",
          title: ["Valid source"],
          author: [{ family: "Smith" }],
          issued: { "date-parts": [[2020]] },
        },
      ],
    },
  }, 2026);

  assert.equal(records.length, 1);
  assert.equal(records[0]?.title, "Valid source");
});
