import { ApplicationHistory } from "@/components/application-history";
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
            Reopen your saved resumes and job descriptions without another AI
            request.
          </p>
        </section>
        <ApplicationHistory />
        <details>
          <summary>Development mock history</summary>
          <HistoryList />
        </details>
      </main>
      <footer>
        Personal workspace · Saved history is shared by anyone with access to
        this installation
      </footer>
    </div>
  );
}
