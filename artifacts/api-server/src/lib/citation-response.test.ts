import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCitationSectionResponse, sectionRequiresLiteratureCitations } from "./citation-response.js";
import type { Citation } from "./citation-sources.js";

const existingReference: Citation = {
  id: "synthetic-saved-reference",
  title: "Previous study of femoral fracture outcomes",
  authors: [{ lastName: "Otieno" }, { lastName: "Kamau" }],
  year: 2014,
  source: "Crossref",
};

test("only evidence-heavy sections require citations", () => {
  assert.equal(sectionRequiresLiteratureCitations("1.1 Introduction"), true);
  assert.equal(sectionRequiresLiteratureCitations("1.5 Research Questions"), false);
  assert.equal(sectionRequiresLiteratureCitations("2.3 Literature related to an objective"), true);
  assert.equal(sectionRequiresLiteratureCitations("3.1 Study Design"), false);
});

test("a supplied, verified source is rendered as an author-date citation", () => {
  const result = parseCitationSectionResponse(
    '{"content":"Evidence supports the approach [[CITE:crossref-abc]].","references":[]}',
    [{
      id: "crossref-abc",
      title: "Interlocking nailing outcomes in femoral fractures",
      authors: [{ lastName: "Mwangi" }, { lastName: "Otieno" }, { lastName: "Kamau" }],
      year: 2014,
      journal: "East African Orthopaedic Journal",
      doi: "10.1000/example",
      source: "Crossref",
    }],
    true,
    2026,
  );

  assert.equal(result.content, "Evidence supports the approach (Mwangi et al., 2014).");
  assert.deepEqual(result.citedIds, ["crossref-abc"]);
  assert.equal(result.references[0]?.source, "Crossref");
});

test("nested envelopes and model preambles are flattened before citations are rendered", () => {
  const inner = JSON.stringify({
    content: "Relevant evidence supports this outcome [[CITE:crossref-abc]].",
    references: [],
  });
  const outer = JSON.stringify({
    content: `I apologize for the earlier response.\nHere is the requested proposal section:\n\n${inner}`,
    references: [],
  });
  const result = parseCitationSectionResponse(
    outer,
    [{
      id: "crossref-abc",
      title: "Clinical outcomes in the study population",
      authors: [{ lastName: "Mwangi" }],
      year: 2024,
      source: "Crossref",
    }],
    true,
    2026,
    "2.2 Clinical outcomes",
  );

  assert.equal(result.content, "Relevant evidence supports this outcome (Mwangi, 2024).");
  assert.deepEqual(result.citedIds, ["crossref-abc"]);
});

test("existing verified references can be reused by their exact saved id", () => {
  const result = parseCitationSectionResponse(
    '{"content":"Earlier evidence is relevant [[CITE:synthetic-saved-reference]]."}',
    [existingReference],
    true,
    2026,
  );

  assert.equal(result.content, "Earlier evidence is relevant (Otieno & Kamau, 2014).");
  assert.deepEqual(result.citedIds, ["synthetic-saved-reference"]);
  assert.deepEqual(result.references, [existingReference]);
});

test("unknown markers and invented bibliography entries are rejected for retry", () => {
  assert.throws(
    () => parseCitationSectionResponse('{"content":"Claim [[CITE:unknown]]."}', [], true, 2026),
    /without a matching reference/,
  );
  assert.throws(
    () => parseCitationSectionResponse('{"content":"A literature paragraph without evidence."}', [], true, 2026),
    /at least one matching citation/,
  );
  assert.throws(
    () => parseCitationSectionResponse(
      '{"content":"Claim [[CITE:fake]].","references":[{"id":"fake","title":"Invented","authors":[{"lastName":"Doe"}],"year":2020}]}',
      [],
      true,
      2026,
    ),
    /supplied Crossref records/,
  );
});

test("citation-free sections accept plain text and discard stray generated citation data", () => {
  const plain = parseCitationSectionResponse(
    "Definition of Terms\nA study design is the plan used to answer a research question.",
    [],
    false,
    2026,
    "Definition of Terms",
  );
  assert.equal(plain.content, "A study design is the plan used to answer a research question.");
  assert.deepEqual(plain.citedIds, []);

  const json = parseCitationSectionResponse(
    '{"content":"The study [[CITE:fake]] uses a clear design.","references":[{"id":"fake"}]}',
    [],
    false,
  );
  assert.equal(json.content, "The study  uses a clear design.");
  assert.deepEqual(json.references, []);
});

test("citation-free sections remove nested wrappers and reject unresolved placeholders", () => {
  const response = JSON.stringify({
    content: "I apologize for the mistake.\nHere is the requested proposal section:\n\nDefinition of Terms\nFlat foot: A condition involving a reduced arch.",
    references: [],
  });
  const result = parseCitationSectionResponse(response, [], false, 2026, "Definition of Terms");
  assert.equal(result.content, "Flat foot: A condition involving a reduced arch.");
  assert.throws(
    () => parseCitationSectionResponse(
      '{"content":"The supervisor is [TO CONFIRM].","references":[]}',
      [],
      false,
      2026,
    ),
    /unresolved placeholder/,
  );
});

test("malformed citation JSON and model-invented reference records are rejected", () => {
  assert.throws(
    () => parseCitationSectionResponse('{"content":"unfinished"', [], true, 2026),
    /malformed citation JSON/,
  );
  assert.throws(
    () => parseCitationSectionResponse(
      '{"content":"Claim [[CITE:fake]].","references":[{"id":"fake","title":"Unverified source","authors":[{"lastName":"Doe"}],"year":2020}]}',
      [],
      true,
      2026,
    ),
    /supplied Crossref records/,
  );
});
