import type { ParsedResume } from "@/types/optimization";

export function ResumePreview({ resume }: { resume: ParsedResume }) {
  return (
    <section
      className="resume-preview"
      aria-labelledby="resume-preview-heading"
    >
      <h3 id="resume-preview-heading">Extracted resume text</h3>
      <p>{resume.originalFilename}</p>
      <p className="hint">
        Check the text and reading order below. Images and original formatting
        are not included. No AI changes have been made.
      </p>
      <pre tabIndex={0} aria-label="Extracted resume text">
        {resume.text}
      </pre>
    </section>
  );
}
