const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdirSync, writeFileSync } = require("node:fs");
const { resolve, join } = require("node:path");
const mammoth = require("mammoth");
const { PDFParse } = require("pdf-parse");
const { ResumeRenderer } = require("../dist/exports/resume-renderer");
const { output } = require("./fixtures/resume.cjs");
test("Word and converted PDF preserve sections, accents and long flowing content", async (t) => {
  for (const name of ["short", "long"]) {
    await t.test(name, async () => {
      const resume = structuredClone(output.resume);
      resume.contact.name = "José Example";
      resume.contact.location = "Vancouver, BC";
      resume.contact.phone = "+1 555 0100";
      resume.contact.email = "jose@example.test";
      resume.contact.links = [
        "github.com/jose-example",
        "https://www.linkedin.com/in/jose-example",
        "https://portfolio.example.test",
      ];
      if (name === "long") {
        resume.experience = Array.from({ length: 6 }, (_, i) => ({
          ...resume.experience[0],
          title: "Software Engineer " + (i + 1),
          bullets: Array.from(
            { length: 6 },
            (_, j) =>
              "Delivered reporting improvements with cross-functional teams, documenting requirements and validating results for business stakeholders. Experience " +
              i +
              " contribution " +
              j +
              ".",
          ),
        }));
        resume.languages = [
          { name: "English", proficiency: "Professional" },
          { name: "French", proficiency: "END OF RESUME" },
        ];
      }
      const files = await new ResumeRenderer().render(resume);
      assert.equal(files.docx.subarray(0, 2).toString(), "PK");
      const word = (await mammoth.extractRawText({ buffer: files.docx })).value;
      const parser = new PDFParse({ data: files.pdf });
      try {
        const pdf = await parser.getText();
        for (const text of [
          "José Example",
          "Personal Information",
          "Location: Vancouver, BC",
          "Phone number: +1 555 0100",
          "Email address: jose@example.test",
          "GitHub: github.com/jose-example",
          "LinkedIn: https://www.linkedin.com/in/jose-example",
          "https://portfolio.example.test",
          "PROFESSIONAL SUMMARY",
          "SKILLS",
          "EXPERIENCE",
          "CERTIFICATIONS & AWARDS",
          "Second Place, Company Hackathon",
          "2025",
        ]) {
          assert(word.includes(text));
          assert(pdf.text.includes(text), "PDF lost expected resume text");
        }
        assert.equal(word.includes("EDUCATION"), false);
        assert(word.indexOf("Personal Information") < word.indexOf("PROFESSIONAL SUMMARY"));
        if (name === "long") {
          assert(pdf.total > 1);
          assert(pdf.text.includes("END OF RESUME"));
        }
      } finally {
        await parser.destroy();
      }
      if (process.env.EXPORT_QA_DIR) {
        const dir = resolve(process.env.EXPORT_QA_DIR);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, name + ".docx"), files.docx);
        writeFileSync(join(dir, name + ".pdf"), files.pdf);
      }
    });
  }
});
