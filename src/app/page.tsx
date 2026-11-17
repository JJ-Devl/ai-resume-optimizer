import { OptimizerForm } from "@/components/optimizer-form";
import { SiteHeader } from "@/components/site-header";

export default function Home() {
  return (
    <div className="shell">
      <SiteHeader />
      <main id="main">
        <section className="intro home-intro"><div className="hero-copy">
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
        </div><div className="hero-overpass" role="img" aria-label="Modern city overpass beside glass office buildings"><span>BUILD YOUR NEXT CHAPTER</span></div></section>
        <div className="workspace">

          <aside className="sidebar" aria-label="How it works">
            <span className="eyebrow">YOUR APPLICATION GUIDE</span>
            <h2>
              Four steps to <br />
              your next opportunity.
            </h2>
            <ol className="steps">
              <li>
                <span>01</span>
                <div>
                  <h3>Upload your resume</h3>
                  <p>Choose a text-based PDF or DOCX, up to 5 MB. Scanned PDFs need text recognition first.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>Add the target role</h3>
                  <p>
                    Paste the full job description. Add the company and role name, then any writing preferences.
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>Generate and review</h3>
                  <p>
                    Click Generate to make one paid AI request. Check the tailored content
                    before using it.
                  </p>
                </div>
              </li>
            <li><span>04</span><div><h3>Download your files</h3><p>Open the saved application in History. Generate Word/PDF, then download. This step makes no additional AI call.</p></div></li></ol>
            <div className="privacy">
              <strong>Your resume, tailored with Astra.</strong>
              <p>
                Your resume is extracted in memory. Extracted text, the job
                description, and your preferences are sent to OpenAI for
                optimization. Successful results, original extracted text, and
                job descriptions are saved in PostgreSQL so you can reopen them
                in History.
              </p>
            </div>
          </aside><OptimizerForm />
        </div>
      </main>
      <footer>
        <span>Thoughtful applications start here.</span>
        <span>Resume optimization · Powered by Astra</span>
      </footer>
    </div>
  );
}
