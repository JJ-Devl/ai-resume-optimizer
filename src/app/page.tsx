import { OptimizerForm } from "@/components/optimizer-form";
import Link from "next/link";

export default function Home() {
  return (
    <div className="shell">
      <header className="header"><Link className="brand" href="/"><span className="brand-icon">↗</span> Resume Optimizer</Link><span className="badge">WORKSPACE / V1</span></header>
      <main id="main">
        <section className="intro">
          <p className="eyebrow">YOUR EXPERIENCE. THE RIGHT WORDS.</p>
          <h1>Your next chapter<br />starts with a better resume.</h1>
          <p className="lede">Bring your experience and the opportunity together. Start with your resume and the role you have in mind.</p>
        </section>
        <div className="workspace">
          <OptimizerForm />
          <aside className="sidebar" aria-label="How it works">
            <span className="eyebrow">A MORE FOCUSED APPLICATION</span>
            <h2>Built around<br />your next move.</h2>
            <ol className="steps">
              <li><span>01</span><div><h3>Start with your story</h3><p>Add your existing resume as a PDF or Word document.</p></div></li>
              <li><span>02</span><div><h3>Set the direction</h3><p>Paste the job description and add any writing preferences.</p></div></li>
              <li><span>03</span><div><h3>Make it relevant</h3><p>Tailored content and document exports are coming in the next milestone.</p></div></li>
            </ol>
            <div className="privacy"><strong>Your resume stays with you.</strong><p>This preview checks your inputs locally. It does not upload, store, or send your documents to AI.</p></div>
          </aside>
        </div>
      </main>
      <footer><span>Thoughtful applications start here.</span><span>Milestone 01 · Input workspace</span></footer>
    </div>
  );
}
