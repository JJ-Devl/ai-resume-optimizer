import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="header">
      <Link className="brand" href="/">
        <span className="brand-icon">↗</span> Resume Optimizer
      </Link>
      <nav className="nav" aria-label="Main navigation">
        <Link href="/">Create</Link>
        <Link href="/history">History</Link>
      </nav>
    </header>
  );
}
