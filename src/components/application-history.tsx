"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getApplications } from "@/lib/api";
import type { ApplicationSummary } from "@/types/optimization";

export function ApplicationHistory() {
  const [items, setItems] = useState<ApplicationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  function refresh() {
    setLoading(true);
    setError(null);
    setRevision((v) => v + 1);
  }
  useEffect(() => {
    let active = true;
    getApplications()
      .then((result) => {
        if (active) setItems(result.items);
      })
      .catch((err: unknown) => {
        if (active)
          setError(
            err instanceof Error
              ? err.message
              : "Could not load saved applications.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  return (
    <section
      className="history-section"
      aria-label="Saved AI applications"
      aria-busy={loading}
    >
      <div className="card-heading">
        <h2>Saved resumes</h2>
        <button
          className="secondary-button"
          onClick={refresh}
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      {loading && <p role="status">Loading saved applications…</p>}
      {error && (
        <div className="message error" role="alert">
          <p>{error}</p>
          <button className="secondary-button" onClick={refresh}>
            Try again
          </button>
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="empty-state">
          <h3>No saved resumes yet.</h3>
          <p>Optimize a resume to save your first application.</p>
          <Link href="/">Create an application →</Link>
        </div>
      )}
      {!loading && !error && items.length > 0 && (
        <ul className="history-list">
          {items.map((item) => (
            <li className="history-item" key={item.id}>
              <div>
                <span className="eyebrow">{item.companyName}</span>
                <h3>
                  <Link href={"/history/" + item.id}>{item.jobTitle}</Link>
                </h3>
                <p className="history-file">{item.resumeFilename}</p>
              </div>
              <div className="history-meta">
                <span className="status-pill">AI resume saved</span>
                <span>
                  {item.documentStatus === "ready"
                    ? "Word and PDF ready"
                    : ["deleting", "delete_failed"].includes(
                          item.documentStatus,
                        )
                      ? "Deletion pending"
                      : "Open to generate documents"}
                </span>
                <time dateTime={item.createdAt}>
                  {new Date(item.createdAt).toLocaleString()}
                </time>
                <Link href={"/history/" + item.id}>View resume →</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        Latest 50 applications · Opening a saved resume does not call AI
      </p>
    </section>
  );
}
