"use client";
import { useState } from "react";
import type { OptimizationResponse } from "@/types/optimization";

export function OptimizationPreview({
  result,
  saved = true,
}: {
  result: OptimizationResponse["optimized"];
  saved?: boolean;
}) {
  const [copyStatus, setCopyStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(result.resumeText);
      setCopyStatus("Resume copied.");
    } catch {
      setCopyStatus("Copy was unavailable. Select and copy the text below.");
    }
  }
  return (
    <section className="resume-preview" aria-labelledby="optimized-heading">
      <h3 id="optimized-heading">Your tailored resume</h3>
      <p role="status">Optimization complete with Astra.</p>
      <button type="button" onClick={copy}>
        Copy resume text
      </button>
      <span role="status"> {copyStatus}</span>
      <pre tabIndex={0} aria-label="Optimized resume text">
        {result.resumeText}
      </pre>
      <details>
        <summary>Changes and added skills</summary>
        <ul>
          {result.changes.map((change, index) => (
            <li key={index}>{change}</li>
          ))}
        </ul>
        <p>Skills added to this draft:</p>
        <p>
          {result.skillsAdded.length
            ? result.skillsAdded.join(", ")
            : "No additional skills."}
        </p>
      </details>
      <p className="hint">
        Input: {result.usage.inputTokens.toLocaleString()} tokens · Output:{" "}
        {result.usage.outputTokens.toLocaleString()} tokens (includes{" "}
        {result.usage.reasoningTokens.toLocaleString()} reasoning tokens).
      </p>
      <p className="hint">
        {saved
          ? "Saved in History. Open the saved application to generate Word and PDF files."
          : "Not saved. Copy this result before leaving."}
      </p>
    </section>
  );
}
