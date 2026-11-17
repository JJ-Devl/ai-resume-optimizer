const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseResumeOutput,
  RESUME_SCHEMA,
} = require("../dist/ai/resume.schema");
const { output } = require("./fixtures/resume.cjs");

test("structured content renders one combined certification/award section and omits empty sections", () => {
  const result = parseResumeOutput(JSON.stringify(output));
  assert.deepEqual(result.resume, output.resume);
  assert.match(result.resumeText, /CERTIFICATIONS & AWARDS/);
  assert.match(result.resumeText, /Second Place, Company Hackathon/);
  assert.match(result.resumeText, /Expires: 2025/);
  assert.equal(result.resumeText.includes("EDUCATION"), false);
  assert.equal(result.resumeText.includes("PROJECTS"), false);
  assert.equal(result.resumeText.includes("LANGUAGES"), false);
  assert(
    result.resumeText.indexOf("EXPERIENCE") <
      result.resumeText.indexOf("CERTIFICATIONS & AWARDS"),
  );
  assert.equal(RESUME_SCHEMA.additionalProperties, false);
});
test("strict nested validation rejects malformed, legacy and oversized output", () => {
  const variants = [];
  for (const mutate of [
    (x) => {
      delete x.resume.education;
    },
    (x) => {
      x.resume.extra = "injected";
    },
    (x) => {
      x.resume.contact.email = null;
    },
    (x) => {
      x.resume.certificationsAndAwards[0].type = "invented-type";
    },
    (x) => {
      x.resumeText = "conflicting second version";
    },
    (x) => {
      x.resume.summary = "x".repeat(3001);
    },
    (x) => {
      x.resume.skills = Array(101).fill({ category: "", items: [] });
    },
  ]) {
    const copy = structuredClone(output);
    mutate(copy);
    variants.push(copy);
  }
  variants.push({ resumeText: "legacy", changes: [], skillsAdded: [] });
  variants.forEach((value) =>
    assert.throws(() => parseResumeOutput(JSON.stringify(value))),
  );
});
