import { Injectable, HttpException } from "@nestjs/common";
import {
  Document,
  Paragraph,
  TextRun,
  Packer,
  HeadingLevel,
  AlignmentType,
} from "docx";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseResumeOutput, type StructuredResume } from "../ai/resume.schema";

export const TEMPLATE_VERSION = "classic-v2";
const execute = promisify(execFile);
const nonempty = (items: string[]) =>
  items.map((s) => s.trim()).filter(Boolean);
const line = (items: string[]) => nonempty(items).join(" | ");
const dates = (start: string, end: string) =>
  nonempty([start, end]).join(" – ");
export function buildResumeDocx(resume: StructuredResume): Promise<Buffer> {
  const children: Paragraph[] = [];
  const paragraph = (text: string, bold = false, keepNext = false) => {
    if (text.trim())
      children.push(
        new Paragraph({
          children: [new TextRun({ text, bold })],
          keepNext,
          spacing: { after: 100 },
        }),
      );
  };
  const heading = (text: string) =>
    children.push(
      new Paragraph({
        text,
        heading: HeadingLevel.HEADING_1,
        keepNext: true,
        spacing: { before: 220, after: 100 },
      }),
    );
  const bullets = (items: string[]) =>
    nonempty(items).forEach((text) =>
      children.push(
        new Paragraph({
          text,
          bullet: { level: 0 },
          spacing: { after: 70 },
          widowControl: true,
        }),
      ),
    );
  children.push(
    new Paragraph({
      text: resume.contact.name || "Resume",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
  );
  const links = nonempty(resume.contact.links);
  const platform = (link: string): "github" | "linkedin" | undefined => {
    try {
      const host = new URL(
        /^https?:\/\//i.test(link) ? link : "https://" + link,
      ).hostname.toLowerCase();
      if (host === "github.com" || host === "www.github.com") return "github";
      if (host === "linkedin.com" || host.endsWith(".linkedin.com"))
        return "linkedin";
    } catch {
      // Keep unrecognized links below the named contact fields.
    }
  };
  heading("Personal Information");
  paragraph("Location: " + resume.contact.location.trim());
  paragraph("Phone number: " + resume.contact.phone.trim());
  paragraph("Email address: " + resume.contact.email.trim());
  paragraph("GitHub: " + links.filter((link) => platform(link) === "github").join(" | "));
  paragraph("LinkedIn: " + links.filter((link) => platform(link) === "linkedin").join(" | "));
  links.filter((link) => !platform(link)).forEach((link) => paragraph(link));
  if (resume.summary.trim()) {
    heading("PROFESSIONAL SUMMARY");
    paragraph(resume.summary);
  }
  const skills = resume.skills.filter((s) => s.items.some((i) => i.trim()));
  if (skills.length) {
    heading("SKILLS");
    skills.forEach((s) =>
      paragraph(
        (s.category.trim() ? s.category.trim() + ": " : "") +
          nonempty(s.items).join(", "),
      ),
    );
  }
  if (resume.experience.length) {
    heading("EXPERIENCE");
    resume.experience.forEach((e) => {
      paragraph(
        line([e.title, e.employer, e.location, dates(e.startDate, e.endDate)]),
        true,
        true,
      );
      bullets(e.bullets);
    });
  }
  if (resume.education.length) {
    heading("EDUCATION");
    resume.education.forEach((e) => {
      paragraph(
        line([
          e.qualification,
          e.institution,
          e.location,
          dates(e.startDate, e.endDate),
        ]),
        true,
        e.details.length > 0,
      );
      bullets(e.details);
    });
  }
  if (resume.projects.length) {
    heading("PROJECTS");
    resume.projects.forEach((p) => {
      paragraph(line([p.name, ...p.links]), true, true);
      paragraph(p.description, false, p.bullets.length > 0);
      bullets(p.bullets);
    });
  }
  if (resume.certificationsAndAwards.length) {
    heading("CERTIFICATIONS & AWARDS");
    resume.certificationsAndAwards.forEach((e) => {
      paragraph(
        line([
          e.name,
          e.issuer,
          e.date,
          e.expiryDate ? "Expires: " + e.expiryDate : "",
        ]),
        true,
        e.details.length > 0,
      );
      bullets(e.details);
    });
  }
  if (resume.languages.length) {
    heading("LANGUAGES");
    resume.languages.forEach((l) => paragraph(line([l.name, l.proficiency])));
  }
  return Packer.toBuffer(
    new Document({
      creator: "Resume Optimizer",
      title: resume.contact.name ? resume.contact.name + " Resume" : "Resume",
      styles: {
        default: {
          document: {
            run: { font: "Arial", size: 22, color: "000000" },
            paragraph: { spacing: { line: 270 } },
          },
        },
        paragraphStyles: [
          {
            id: "Title",
            name: "Title",
            basedOn: "Normal",
            run: { font: "Arial", size: 44, bold: true, color: "000000" },
            paragraph: { keepNext: true },
          },
          {
            id: "Heading1",
            name: "Heading 1",
            basedOn: "Normal",
            run: { font: "Arial", size: 22, bold: true, color: "000000" },
            paragraph: { keepNext: true },
          },
        ],
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 12240, height: 15840 },
              margin: { top: 900, bottom: 900, left: 900, right: 900 },
            },
          },
          children,
        },
      ],
    }),
  );
}
@Injectable()
export class ResumeRenderer {
  private active = false;
  officePath() {
    if (process.env.LIBREOFFICE_PATH?.trim())
      return process.env.LIBREOFFICE_PATH.trim();
    if (process.platform === "win32") {
      const candidate = join(
        process.env.ProgramFiles || "C:\\Program Files",
        "LibreOffice",
        "program",
        "soffice.exe",
      );
      if (!existsSync(candidate))
        throw new HttpException(
          {
            code: "PDF_RENDERER_UNAVAILABLE",
            message:
              "Install LibreOffice Writer or configure LIBREOFFICE_PATH to generate PDF files.",
          },
          503,
        );
      return candidate;
    }
    return "soffice";
  }
  async render(value: unknown) {
    if (this.active)
      throw new HttpException(
        {
          code: "EXPORT_BUSY",
          message:
            "Another document is being rendered. Please try again shortly.",
        },
        429,
      );
    this.active = true;
    let directory: string | undefined;
    try {
      const office = this.officePath();
      const { resume } = parseResumeOutput(
        JSON.stringify({ resume: value, changes: [], skillsAdded: [] }),
      );
      const docx = await buildResumeDocx(resume);
      directory = await mkdtemp(join(tmpdir(), "resume-export-"));
      await writeFile(join(directory, "resume.docx"), docx);
      await execute(
        office,
        [
          "-env:UserInstallation=" +
            pathToFileURL(join(directory, "profile")).href,
          "--headless",
          "--nologo",
          "--nodefault",
          "--nofirststartwizard",
          "--convert-to",
          "pdf:writer_pdf_Export",
          "--outdir",
          directory,
          join(directory, "resume.docx"),
        ],
        { timeout: 60000, maxBuffer: 1024 * 1024, windowsHide: true },
      );
      const pdf = await readFile(join(directory, "resume.pdf"));
      if (
        !pdf.subarray(0, 5).equals(Buffer.from("%PDF-")) ||
        pdf.length > 10 * 1024 * 1024 ||
        docx.length > 10 * 1024 * 1024
      )
        throw new Error("Invalid document output");
      return { docx, pdf };
    } finally {
      try {
        if (directory)
          await rm(directory, {
            recursive: true,
            force: true,
            maxRetries: 3,
            retryDelay: 200,
          });
      } finally {
        this.active = false;
      }
    }
  }
}
