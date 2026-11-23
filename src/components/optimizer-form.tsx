"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { RESUME_ACCEPT, validateResume } from "@/lib/documents/validation";
import { apiRequest, getCapabilities } from "@/lib/api";
import type {
  GenerationResponse,
  MockScenario,
  ParsedResume,
} from "@/types/optimization";
import { ResumePreview } from "./resume-preview";
import { OptimizationPreview } from "./optimization-preview";
import type { OptimizationResponse } from "@/types/optimization";

export function OptimizerForm() {
  const [resume, setResume] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ParsedResume | null>(null);
  const [optimized, setOptimized] = useState<
    OptimizationResponse["optimized"] | null
  >(null);
  const [stage, setStage] = useState("");
  const [saveStatus, setSaveStatus] = useState<{
    id: string | null;
    error: string | null;
  } | null>(null);
  const submitting = useRef(false);
  const [simulations, setSimulations] = useState(false);

  useEffect(() => {
    let active = true;
    getCapabilities()
      .then((value) => {
        if (active) setSimulations(value.simulationsEnabled);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setResult(null);
    setOptimized(null);
    setSaveStatus(null);
    setPreview(null);
    setError(null);
    const fileError = validateResume(resume);
    if (fileError || !resume) {
      setError(fileError);
      return;
    }
    const data = new FormData(event.currentTarget);
    const jobDescription = String(data.get("jobDescription") ?? "").trim();
    const jobUrl = String(data.get("jobUrl") ?? "").trim();
    if (!jobDescription) {
      setError("Paste the job description to continue.");
      return;
    }
    if (jobUrl) {
      try {
        const url = new URL(jobUrl);
        if (!["http:", "https:"].includes(url.protocol))
          throw new Error("Unsupported protocol");
      } catch {
        setError("Use a complete job URL starting with https:// or http://.");
        return;
      }
    }
    submitting.current = true;
    setLoading(true);
    setStage("Processing your resume…");
    try {
      const upload = new FormData();
      upload.append("resume", resume);
      const scenario = simulations
        ? String(data.get("scenario") ?? "astra")
        : "astra";
      if (scenario === "astra") {
        upload.append("jobDescription", jobDescription);
        for (const field of ["companyName", "jobTitle"]) {
          const value = String(data.get(field) ?? "").trim();
          if (value) upload.append(field, value);
        }
        if (jobUrl) upload.append("jobUrl", jobUrl);
        const customPrompt = String(data.get("customPrompt") ?? "").trim();
        if (customPrompt) upload.append("customPrompt", customPrompt);
        setStage("Astra is tailoring your resume…");
        const response = await apiRequest<OptimizationResponse>(
          "optimizations",
          {
            method: "POST",
            body: upload,
          },
        );
        setPreview(response.original);
        setOptimized(response.optimized);
        setSaveStatus({
          id: response.application?.id ?? null,
          error: response.saveError,
        });
        return;
      }
      setStage("Reading your resume…");
      const extracted = await apiRequest<ParsedResume>("documents/preview", {
        method: "POST",
        body: upload,
      });
      setPreview(extracted);
      setStage("Testing the mock response…");
      const response = await apiRequest<GenerationResponse>("generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeFilename: resume.name,
          resumeSize: resume.size,
          jobDescription,
          jobUrl: jobUrl || undefined,
          customPrompt:
            String(data.get("customPrompt") ?? "").trim() || undefined,
          scenario: simulations
            ? (String(data.get("scenario") ?? "success") as MockScenario)
            : "success",
        }),
      });
      setResult(response);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not submit your request. Please try again.",
      );
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return (
    <form className="form-card" onSubmit={submit} aria-busy={loading}>
      <div className="card-heading">
        <h2>Create your application</h2>
        <span>Required fields *</span>
      </div>
      <fieldset
        disabled={loading}
        className="form-fields"
        onChange={() => {
          setResult(null);
          setOptimized(null);
          setPreview(null);
          setError(null);
        }}
      >
        <section className="form-step">
          <h3>
            <span>01</span> Your experience
          </h3>
          <div className="field">
            <label htmlFor="resume">
              Your resume <span>*</span>
            </label>
            <div className="upload">
              <span className="upload-icon" aria-hidden="true">
                ↑
              </span>
              <strong>
                {resume
                  ? resume.name
                  : "A good starting point: your experience"}
              </strong>
              <p id="resume-help">
                Text-based PDF or DOCX · Up to 5 MB · Uploaded for text preview
              </p>
              <input
                id="resume"
                name="resume"
                type="file"
                accept={RESUME_ACCEPT}
                required
                aria-describedby="resume-help"
                onChange={(event) => {
                  setResume(event.target.files?.[0] ?? null);
                }}
              />
            </div>
          </div>
        </section>
        <section className="form-step">
          <h3>
            <span>02</span> The opportunity
          </h3>
          <div className="field">
            <label htmlFor="companyName">
              Company name <small>Optional</small>
            </label>
            <input
              id="companyName"
              name="companyName"
              maxLength={160}
              placeholder="e.g. Northstar Labs"
            />
            <label htmlFor="jobTitle">
              Job title <small>Optional</small>
            </label>
            <input
              id="jobTitle"
              name="jobTitle"
              maxLength={160}
              placeholder="e.g. Frontend Engineer"
            />
            <p className="hint">
              Your entries take priority. Leave either blank to identify it from
              the job description using AI.
            </p>
            <label htmlFor="jobDescription">
              Job description <span>*</span>
            </label>
            <textarea
              id="jobDescription"
              name="jobDescription"
              required
              maxLength={30000}
              rows={7}
              placeholder={
                "Company: Northstar Labs\nRole: Frontend Engineer\n\nPaste the role, responsibilities, and qualifications here…"
              }
            />
            <p className="hint">
              Include the responsibilities and qualifications you want your
              resume to address.
            </p>
          </div>
          <div className="field">
            <label htmlFor="jobUrl">
              Job posting URL <small>Optional</small>
            </label>
            <input
              id="jobUrl"
              name="jobUrl"
              type="url"
              maxLength={2048}
              placeholder="https://company.com/careers/your-next-role"
            />
            <p className="hint">For reference only. Links are not fetched.</p>
          </div>
        </section>
        <section className="form-step">
          <h3>
            <span>03</span> Make it yours
          </h3>
          <div className="field">
            <label htmlFor="customPrompt">
              Your rules and writing preferences <small>Optional</small>
            </label>
            <textarea
              id="customPrompt"
              name="customPrompt"
              maxLength={5000}
              rows={3}
              placeholder="e.g. Use British English, emphasize leadership, and keep the summary concise."
            />
          </div>
          <p className="hint">
            These instructions apply to this application and are sent with your
            resume and job description.
          </p>
        </section>
        {simulations && (
          <details className="demo-controls">
            <summary>Test a backend response</summary>
            <label htmlFor="scenario">Response scenario</label>
            <select id="scenario" name="scenario" defaultValue="astra">
              <option value="astra">
                Astra — optimize resume (paid API call)
              </option>
              <option value="success">Success — save a mock record</option>
              <option value="validation">Resume rejected (422)</option>
              <option value="rate-limit">Too many requests (429)</option>
              <option value="unavailable">Service unavailable (503)</option>
              <option value="server-error">Server error (500)</option>
              <option value="timeout">Backend timeout (504)</option>
              <option value="slow">Slow connection — browser timeout</option>
            </select>
            <p className="hint">
              Mock options do not call AI. Simulated failures do not save a
              record.
            </p>
          </details>
        )}
      </fieldset>
      {error && (
        <div className="message error" role="alert">
          <p>{error}</p>
          <p>Your inputs are preserved. You can try Generate again.</p>
        </div>
      )}
      {result && (
        <div className="message success" role="status">
          <strong>Mock request saved.</strong>
          <p>{result.message}</p>
          <Link href="/history">View history →</Link>
        </div>
      )}
      {optimized && (
        <OptimizationPreview
          result={optimized}
          saved={Boolean(saveStatus?.id)}
        />
      )}
      {saveStatus?.id && (
        <Link href={"/history/" + saveStatus.id}>Open saved application →</Link>
      )}
      {saveStatus?.error && (
        <div className="message error" role="alert">
          <p>{saveStatus.error}</p>
        </div>
      )}
      {preview && <ResumePreview resume={preview} />}
      <button className="generate" type="submit" disabled={loading}>
        {loading ? stage : "Generate"} <span aria-hidden="true">↗</span>
      </button>
      <p className="preview-note" role="status">
        {loading
          ? stage
          : "One Astra call per optimization · Generate Word/PDF from saved History"}
      </p>
    </form>
  );
}
