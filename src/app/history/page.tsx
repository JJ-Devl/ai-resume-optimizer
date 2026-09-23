import { HistoryList } from "@/components/history-list";
import { SiteHeader } from "@/components/site-header";

export default function HistoryPage() {
  return (
    <div className="shell">
      <SiteHeader />
      <main id="main">
        <section className="intro">
          <p className="eyebrow">YOUR APPLICATION WORKSPACE</p>
          <h1>
            A record of your
            <br />
            next steps.
          </h1>
          <p className="lede">
            Browse saved mock requests and sample history. Every result is a
            preview; no resume has been generated yet.
          </p>
        </section>
        <HistoryList />
      </main>
      <footer>
        Local demo workspace · History persists when the server restarts
      </footer>
    </div>
  );
}
