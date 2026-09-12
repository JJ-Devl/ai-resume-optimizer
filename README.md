# AI Resume Optimizer

A focused application workspace built with Next.js App Router, TypeScript, and React.
Select a resume, paste a job description, and add writing preferences to prepare
for a tailored application.

**Status: milestone 1 — input workspace.** No authentication, database,
document parsing, AI calls, or document exports are implemented yet.

## Run locally

Use Node.js 24 LTS and npm. From this project directory:

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). No API key is required.
For future integrations, copy `.env.example` to `.env.local` and fill in values
locally. Never commit credentials or use `NEXT_PUBLIC_` for secrets.

## What works

- Responsive, accessible form with visible labels, keyboard focus, and status messages.
- Required PDF/DOCX resume selection with a 5 MB limit and empty-file checks.
- Required job description (up to 30,000 characters).
- Optional HTTP(S) job URL (2,048 characters), stored only in form state; never fetched.
- Optional custom prompt (5,000 characters).
- Generate validates inputs and explains that parsing and generation are coming next.

Files stay in browser memory. This milestone does not read file contents, send
network requests on submission, save application history, or persist form values.
Refreshing clears the workspace. File extension checks are for usability, not
a security boundary.

## Repository structure

```text
src/
  app/                  Page, metadata, and global styling
  components/           Interactive optimizer form
  lib/
    ai/                 Future server-only AI service boundary
    documents/          File checks and future parsers / exporters
  types/                Shared input and parsed-resume contracts
.github/workflows/      Lint, type checking, and production build
.env.example            Empty configuration template
```

The page handles composition; the form handles browser interactions.
Document parsers will extract text, AI will produce structured content, and
templates will control DOCX/PDF layout. These responsibilities stay separate.

## Quality checks

```sh
npm run lint
npm run typecheck
npm run build
```

`npm start` serves a production build. GitHub Actions runs the same quality checks.
The lockfile is committed for reproducible installation.

Manual acceptance checks:
1. Submit an empty form: required fields prevent submission.
2. Select a non-PDF/DOCX, empty, or over-5-MB file: a helpful error appears.
3. Select a valid-sized PDF/DOCX and paste a job description: Generate shows the
   milestone notice without uploading or generating anything.
4. Enter whitespace-only job text or a non-HTTP(S) URL: submission is rejected.
5. Edit after a successful submission: the previous success notice clears.
6. Verify the page on mobile and with keyboard navigation.

## Next milestone

1. Add a server upload endpoint with independent size, signature, and content
   validation; parse DOCX/PDF into the shared `ParsedResume` contract.
2. Add a server-only AI service, structured output validation, and clear failure
   states. Keep claims faithful to the source resume.
3. Render reviewed content through deterministic DOCX/PDF templates.
4. Later, introduce PostgreSQL generation records including company, job title,
   and creation time, with explicit retention and access rules.

Before enabling a public paid AI endpoint, add request limits and usage controls.
If URL fetching is added, protect it against requests to private/internal networks.
Do not expose resumes or generation history publicly.

## GitHub preparation

This folder is an independent Git repository on the `main` branch. No remote is
configured and no commit is created automatically. Review the files, then:

```sh
git add .
git diff --cached
git commit -m "feat: scaffold resume optimizer input workspace"
```

Create an empty GitHub repository, then use its displayed commands to add the
remote and push `main`.

Only source code and fictional sample data belong in the repository. Secrets,
uploaded resumes, generated documents, temporary files, and local databases are
ignored. `.env.example` is intentionally included. Gitignore does not remove
files that were already tracked; inspect staged changes before each commit.

Built using the official [Next.js installation guidance](https://nextjs.org/docs/app/getting-started/installation).
