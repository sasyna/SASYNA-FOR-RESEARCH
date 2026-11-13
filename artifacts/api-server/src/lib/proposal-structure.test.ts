import assert from "node:assert/strict";
import { test } from "node:test";
import {
  abbreviationsForProposal,
  literatureHeadingForObjective,
  objectiveLinesFromContent,
  orderGenerationTargets,
} from "./proposal-structure.js";

test("goals generate before dependent sections and end matter remains last", () => {
  const sections = [
    { heading: "List of Abbreviations and Acronyms", position: 1 },
    { heading: "Definition of Terms", position: 2 },
    { heading: "1.5 Research Questions", position: 3 },
    { heading: "1.6 Broad Objectives", position: 4 },
    { heading: "1.6.1 Specific Objectives", position: 5 },
    { heading: "Abstract", position: 3 },
    { heading: "Chapter One", position: 4 },
  ];

  const generated = orderGenerationTargets(sections);

  assert.deepEqual(generated.map((section) => section.heading), [
    "1.6.1 Specific Objectives",
    "1.6 Broad Objectives",
    "1.5 Research Questions",
    "Abstract",
    "Chapter One",
    "List of Abbreviations and Acronyms",
    "Definition of Terms",
  ]);
  assert.deepEqual(sections.map((section) => section.heading), [
    "List of Abbreviations and Acronyms",
    "Definition of Terms",
    "1.5 Research Questions",
    "1.6 Broad Objectives",
    "1.6.1 Specific Objectives",
    "Abstract",
    "Chapter One",
  ]);
});

test("specific objective lines are normalized and literature headings describe their topic", () => {
  const objectives = objectiveLinesFromContent([
    "Specific Objectives",
    "i) To assess the clinical outcomes of treatment.",
    "ii) Determine the functional recovery after treatment.",
    "iii) Identify complications associated with treatment.",
  ].join("\n"));

  assert.equal(objectives.length, 3);
  assert.equal(objectives[0], "To assess the clinical outcomes of treatment.");
  assert.equal(
    literatureHeadingForObjective(objectives[0], 0),
    "2.2 Clinical outcomes of treatment",
  );
  assert.equal(
    literatureHeadingForObjective(objectives[1], 1),
    "2.3 Functional recovery after treatment",
  );
});

test("abbreviation list includes used known or explicitly expanded acronyms only", () => {
  const content = abbreviationsForProposal({
    title: "Outcomes of IMN at KSH",
    course: "Orthopaedic Trauma",
    department: "KMTC",
    studyLocation: "Kitengela",
    specificObjectives: "",
    researchQuestions: "",
    broadObjective: "",
    sections: [
      {
        heading: "1.1 Introduction",
        content: "The World Health Organization (WHO) describes the study context. DVT and XYZ are discussed.",
      },
      { heading: "References", content: "A journal title may contain DOI." },
    ],
  });

  assert.equal(content, [
    "DVT — Deep Vein Thrombosis",
    "IMN — Intramedullary Nailing",
    "KMTC — Kenya Medical Training College",
    "KSH — Kitengela Sub-County Hospital",
    "WHO — World Health Organization",
  ].join("\n"));
  assert.equal(content.includes("XYZ"), false);
  assert.equal(content.includes("DOI"), false);
});
