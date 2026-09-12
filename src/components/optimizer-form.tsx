"use client";

import { useState, type FormEvent } from "react";
import { RESUME_ACCEPT, validateResume } from "@/lib/documents/validation";
import type { OptimizationInput } from "@/types/optimization";

export function OptimizerForm() {
  const [resume, setResume] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReady(false);
    const fileError = validateResume(resume);
    if (fileError || !resume) { setError(fileError); return; }
    const data = new FormData(event.currentTarget);
    const input: OptimizationInput = {
      resume,
      jobDescription: String(data.get("jobDescription") ?? "").trim(),
      jobUrl: String(data.get("jobUrl") ?? "").trim() || undefined,
      customPrompt: String(data.get("customPrompt") ?? "").trim() || undefined,
    };
    if (!input.jobDescription) { setError("Paste the job description to continue."); return; }
    if (input.jobUrl) {
      try {
        const url = new URL(input.jobUrl);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported protocol");
      } catch { setError("Use a complete job URL starting with https:// or http://."); return; }
    }
    setError(null);
    setReady(true);
  }

  return (
    <form className="form-card" onSubmit={submit} onChange={() => setReady(false)}>
      <div className="card-heading"><h2>Create your application</h2><span>Required fields *</span></div>
      <div className="field">
        <label htmlFor="resume">Your resume <span>*</span></label>
        <div className="upload">
          <span className="upload-icon" aria-hidden="true">↑</span>
          <strong>{resume ? resume.name : "A good starting point: your experience"}</strong>
          <p id="resume-help">PDF or DOCX · Up to 5 MB</p>
          <input id="resume" name="resume" type="file" accept={RESUME_ACCEPT} required aria-describedby="resume-help" onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            setResume(file);
            setError(file ? validateResume(file) : null);
          }} />
        </div>
      </div>
      <div className="field"><label htmlFor="jobDescription">Job description <span>*</span></label><textarea id="jobDescription" name="jobDescription" required maxLength={30000} rows={7} placeholder="Paste the role, responsibilities, and qualifications here…" /><p className="hint">The full description helps bring the most relevant experience forward.</p></div>
      <div className="field"><label htmlFor="jobUrl">Job posting URL <small>Optional</small></label><input id="jobUrl" name="jobUrl" type="url" maxLength={2048} placeholder="https://company.com/careers/your-next-role" /><p className="hint">For reference only. Paste the description above; links are not fetched.</p></div>
      <div className="field"><label htmlFor="customPrompt">Anything to focus on? <small>Optional</small></label><textarea id="customPrompt" name="customPrompt" maxLength={5000} rows={3} placeholder="e.g. Emphasize my leadership experience and keep the tone concise." /></div>
      {error && <p className="message error" role="alert">{error}</p>}
      {ready && <div className="message success" role="status"><strong>Your inputs are ready.</strong><p>Document parsing and AI generation are coming next. No file has been uploaded and no resume has been generated.</p></div>}
      <button className="generate" type="submit">Generate <span aria-hidden="true">↗</span></button>
      <p className="preview-note">Input preview · AI generation is not connected yet</p>
    </form>
  );
}
