import { OptimizerForm } from "@/components/optimizer-form";
import { SiteHeader } from "@/components/site-header";

export default function Home() {
  return (
    <div className="shell">
      <SiteHeader />
      <main id="main">
        <section className="intro">
          <p className="eyebrow">YOUR EXPERIENCE. THE RIGHT WORDS.</p>
          <h1>
            Your next chapter
            <br />
            starts with a better resume.
          </h1>
          <p className="lede">
            Bring your experience and the opportunity together. Start with your
            resume and the role you have in mind.
          </p>
        </section>
        <div className="workspace">
          <OptimizerForm />
          <aside className="sidebar" aria-label="How it works">
            <span className="eyebrow">A MORE FOCUSED APPLICATION</span>
            <h2>
              Built around <br />
              your next move.
            </h2>
            <ol className="steps">
              <li>
                <span>01</span>
                <div>
                  <h3>Start with your story</h3>
                  <p>Add your existing resume as a PDF or Word document.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>Set the direction</h3>
                  <p>
                    Paste the job description and add any writing preferences.
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>Check your resume text</h3>
                  <p>
                    Preview the extracted text and find your mock record in
                    History. AI optimization and exports come later.
                  </p>
                </div>
              </li>
            </ol>
            <div className="privacy">
              <strong>Text preview, with mock history.</strong>
              <p>
                Your resume is uploaded to the backend for text extraction in
                memory. The file and extracted text are not saved. Only company,
                role, filename, and mock result metadata are saved in History.
                No AI is connected.
              </p>
            </div>
          </aside>
        </div>
      </main>
      <footer>
        <span>Thoughtful applications start here.</span>
        <span>Milestone 1 · Resume text preview</span>
      </footer>
    </div>
  );
}
