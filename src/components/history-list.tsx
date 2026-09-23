"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getHistory } from "@/lib/api";
import type { Generation } from "@/types/optimization";

export function HistoryList() {
  const [items, setItems] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  function load() {
    setLoading(true);
    setError(null);
    setRevision((value) => value + 1);
  }
  useEffect(() => {
    let active = true;
    getHistory()
      .then((result) => {
        if (active) setItems(result.items);
      })
      .catch((error: unknown) => {
        if (active)
          setError(
            error instanceof Error ? error.message : "Could not load history.",
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
      aria-label="Generation history"
      aria-busy={loading}
    >
      <div className="card-heading">
        <h2>Recent activity</h2>
        <button
          className="secondary-button"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      {loading && <p role="status">Loading your history…</p>}
      {error && (
        <div className="message error" role="alert">
          <p>{error}</p>
          <button className="secondary-button" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="empty-state">
          <h3>Your history starts here.</h3>
          <p>Submit a successful mock request to save your first record.</p>
          <Link href="/">Create an application →</Link>
        </div>
      )}
      {!loading && !error && items.length > 0 && (
        <ul className="history-list">
          {items.map((item) => (
            <li className="history-item" key={item.id}>
              <div>
                <span className="eyebrow">{item.companyName}</span>
                <h3>{item.jobTitle}</h3>
                <p className="history-file">{item.resumeFilename}</p>
              </div>
              <div className="history-meta">
                <span className="status-pill">
                  {item.source === "seed" ? "Demo data" : "Mock result"}
                </span>
                <time dateTime={item.createdAt}>
                  {new Date(item.createdAt).toLocaleString()}
                </time>
                <span>No document generated</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        Latest 50 records · Demo companies are fictional · No AI generation yet
      </p>
    </section>
  );
}
