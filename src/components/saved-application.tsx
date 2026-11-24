"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getApplication,
  generateDocuments,
  getDocumentDownload,
  deleteApplication,
} from "@/lib/api";
import { useRouter } from "next/navigation";
import type { SavedApplication as Application } from "@/types/optimization";
import { OptimizationPreview } from "./optimization-preview";
import { ResumePreview } from "./resume-preview";

export function SavedApplication({ id }: { id: string }) {
  const router = useRouter();
  const [operation, setOperation] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [record, setRecord] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    getApplication(id)
      .then((value) => {
        if (active) setRecord(value);
      })
      .catch((err: unknown) => {
        if (active)
          setError(
            err instanceof Error
              ? err.message
              : "Could not load this application.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, revision]);
  async function act(action: "generate" | "pdf" | "docx" | "delete") {
    if (operation) return;
    if (
      action === "delete" &&
      !window.confirm(
        "Permanently delete this application, its saved text, and all generated Word/PDF files?",
      )
    )
      return;
    setOperation(action);
    setActionError(null);
    try {
      if (action === "generate") setRecord(await generateDocuments(id));
      else if (action === "delete") {
        await deleteApplication(id);
        router.push("/history");
        router.refresh();
      } else {
        const { url } = await getDocumentDownload(id, action);
        window.location.assign(url);
      }
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Could not complete this action.",
      );
      // Recover the server's status after a partial operation or response timeout.
      try {
        setRecord(await getApplication(id));
      } catch {
        /* Preserve the readable saved draft. */
      }
    } finally {
      setOperation(null);
    }
  }

  return (
    <section className="history-section" aria-busy={loading}>
      <Link href="/history">← Back to History</Link>
      {loading && <p role="status">Loading your saved resume…</p>}
      {error && (
        <div className="message error" role="alert">
          <p>{error}</p>
          <button
            className="secondary-button"
            onClick={() => {
              setLoading(true);
              setError(null);
              setRevision((v) => v + 1);
            }}
          >
            Try again
          </button>
        </div>
      )}
      {!loading && !error && record && (
        <>
          <h1>{record.jobTitle}</h1>
          <p>
            {record.companyName} ·{" "}
            <time dateTime={record.createdAt}>
              {new Date(record.createdAt).toLocaleString()}
            </time>
          </p>
          <section
            className="document-actions"
            aria-label="Word and PDF files"
            aria-busy={Boolean(operation)}
          >
            <h2>Word and PDF</h2>
            <p>
              {record.documents.generatedAt
                ? "Last generated: " +
                  new Date(record.documents.generatedAt).toLocaleString()
                : "Generate downloadable files from this saved resume."}
            </p>
            {record.documents.error && (
              <p role="status">{record.documents.error}</p>
            )}
            <div className="document-buttons">
              <button
                className="secondary-button"
                disabled={
                  Boolean(operation) ||
                  ["deleting", "delete_failed"].includes(
                    record.documents.status,
                  )
                }
                onClick={() => void act("generate")}
              >
                {operation === "generate"
                  ? "Generating Word and PDF…"
                  : record.documents.status === "ready"
                    ? "Regenerate Word and PDF"
                    : "Generate Word and PDF"}
              </button>
              <button
                className="secondary-button"
                disabled={
                  Boolean(operation) || record.documents.status !== "ready"
                }
                onClick={() => void act("docx")}
              >
                Download Word
              </button>
              <button
                className="secondary-button"
                disabled={
                  Boolean(operation) || record.documents.status !== "ready"
                }
                onClick={() => void act("pdf")}
              >
                Download PDF
              </button>
              <button
                className="secondary-button"
                disabled={Boolean(operation)}
                onClick={() => void act("delete")}
              >
                {operation === "delete" ? "Deleting…" : "Delete application"}
              </button>
              <button
                className="secondary-button"
                disabled={Boolean(operation)}
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  setRevision((v) => v + 1);
                }}
              >
                Refresh status
              </button>
            </div>
            {actionError && (
              <div className="message error" role="alert">
                {actionError}
              </div>
            )}
            <p className="hint">
              Generation and downloads use saved content. They do not call AI.
            </p>
          </section>
          <OptimizationPreview result={record.optimized} />
          <details className="resume-preview">
            <summary>Job description and posting URL</summary>
            <pre>{record.jobDescription}</pre>
            {record.jobUrl && /^https?:\/\//i.test(record.jobUrl) && (
              <p><a href={record.jobUrl} target="_blank" rel="noopener noreferrer">View job posting ↗</a></p>
            )}
          </details>
          <details>
            <summary>Original extracted resume</summary>
            <ResumePreview resume={record.original} />
          </details>
        </>
      )}
    </section>
  );
}
