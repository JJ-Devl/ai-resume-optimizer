"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getApplications, setApplicationApplied } from "@/lib/api";
import type { ApplicationSummary } from "@/types/optimization";

export function ApplicationHistory() {
  const [groups, setGroups] = useState<{
    generated: ApplicationSummary[];
    applied: ApplicationSummary[];
  }>({ generated: [], applied: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  const [revision, setRevision] = useState(0);
  function refresh() {
    setLoading(true);
    setError(null);
    setRevision((v) => v + 1);
  }
  useEffect(() => {
    let active = true;

    Promise.all([getApplications("generated"), getApplications("applied")])
      .then(([generated, applied]) => {
        if (active)
          setGroups({ generated: generated.items, applied: applied.items });
      })
      .catch((err: unknown) => {
        if (active)
          setError(
            err instanceof Error ? err.message : "Could not load history.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  async function move(item: ApplicationSummary, applied: boolean) {
    if (pending !== null || loading) return;

    setPending(item.id);
    setActionError(null);
    try {
      await setApplicationApplied(item.id, applied);
      setGroups((old) => ({
        generated: applied
          ? old.generated.filter((r) => r.id !== item.id)
          : [{ ...item, applied }, ...old.generated],
        applied: applied
          ? [{ ...item, applied }, ...old.applied]
          : old.applied.filter((r) => r.id !== item.id),
      }));
      setNotice(applied ? "Moved to Applied." : "Moved back to Generated.");
      refresh();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not update status.",
      );
    } finally {
      setPending(null);
    }
  }
  return (
    <section
      className="history-section"
      aria-label="Saved AI applications"
      aria-busy={loading}
    >
      <div className="card-heading">
        <h2>Application tracker</h2>
        <button
          className="secondary-button"
          onClick={refresh}
          disabled={loading || pending !== null}
        >
          Refresh
        </button>
      </div>
      <p className="hint">
        Mark a role as applied after you submit it to the employer. This button
        only updates your tracker.
      </p>
      <p role="status">{loading ? "Loading applications…" : notice}</p>
      {(error || actionError) && (
        <div className="message error" role="alert">
          {error || actionError}
        </div>
      )}
      {!error &&
        (["generated", "applied"] as const).map((status) => (
          <section key={status} aria-labelledby={"history-" + status}>
            <h3 id={"history-" + status}>
              {status === "generated" ? "Generated" : "Applied"} (
              {groups[status].length})
            </h3>
            {!loading && groups[status].length === 0 && (
              <p className="hint">
                {status === "generated"
                  ? "No generated resumes waiting to apply. Create a resume to get started."
                  : "No applications marked as applied yet."}
              </p>
            )}
            <ul className="history-list">
              {groups[status].map((item) => (
                <li className="history-item" key={item.id}>
                  <div>
                    <span className="eyebrow">{item.companyName}</span>
                    <h3>
                      <Link href={"/history/" + item.id}>{item.jobTitle}</Link>
                    </h3>
                    <p className="history-file">{item.resumeFilename}</p>
                    {item.jobUrl && /^https?:\/\//i.test(item.jobUrl) && (
                      <a href={item.jobUrl} target="_blank" rel="noopener noreferrer">
                        View job posting ↗
                      </a>
                    )}
                  </div>
                  <div className="history-meta">
                    <span className="status-pill">
                      {item.applied ? "Applied" : "Generated"}
                    </span>
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
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={loading || pending !== null}
                      onClick={() => move(item, !item.applied)}
                      aria-label={
                        item.applied
                          ? "Move " +
                            item.jobTitle +
                            " at " +
                            item.companyName +
                            " back to Generated"
                          : "Mark " +
                            item.jobTitle +
                            " at " +
                            item.companyName +
                            " as applied"
                      }
                    >
                      {pending === item.id
                        ? "Saving…"
                        : item.applied
                          ? "Move back to Generated"
                          : "Applied"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      <p className="hint">
        Latest 50 in each section, ordered by creation date · Status changes and
        opening saved resumes do not call AI.
      </p>
    </section>
  );
}
