# Word and PDF exports from saved applications

Open History, select a saved application, then choose Generate Word and PDF.
The backend reads the validated structured resume already stored in PostgreSQL.
It creates a Word document, converts that document to PDF with LibreOffice Writer,
and stores both in Garage. No AI request is made. Regenerate applies the current
template to the same content; it does not rewrite the resume.

The classic-v2 template adds a Personal Information section below the name with
Location, Phone number, Email address, GitHub and LinkedIn labels. Missing values
stay blank; other contact links are preserved. Regenerate existing documents from
History to apply the template without another AI request.

The template is single-column US Letter with Arial body text, clear
headings, bullets, and combined Certifications & Awards. It uses flowing pages
rather than fixed text boxes or a promised page count. Empty optional sections
are omitted. Links are plain text: generated documents do not fetch remote URLs.
Word may paginate differently with a different font/application; the exported PDF
uses the server's LibreOffice and installed fonts.

## Local setup and use

1. Start PostgreSQL and Garage: npm run db:up, then npm run storage:up.
2. Run npm run db:setup after pulling this migration. It is already applied locally.
3. Install LibreOffice Writer on the host where the backend runs. On this Windows
   machine it was found automatically in Program Files/LibreOffice/program.
   Set backend LIBREOFFICE_PATH if installed elsewhere. Linux uses soffice on PATH.
4. Restart npm run dev. Open a saved application in History to generate/download.

StorageService reads ignored .env.storage locally when no explicit S3_BUCKET is
configured. storage:setup also produces ignored .env.storage-client containing
only S3 client credentials for the API container; Garage's RPC secret stays out
of that file. Existing credentials are validated, not silently overwritten.

The API image now installs LibreOffice Writer and matching fonts. Rebuild it after
this change. For compose.images.yaml, run storage:setup, build the local images,
then start the stack with --profile storage. The API uses http://garage:3900 for
internal requests and signs browser links for http://127.0.0.1:3904. These hosts
are different intentionally; never rewrite a URL after signing it.

For hosted S3, configure S3_BUCKET and S3_REGION; omit the custom endpoint and
explicit keys when using AWS role credentials. For another S3-compatible service,
set S3_ENDPOINT, S3_PUBLIC_ENDPOINT and the client access key/secret. These are
trusted backend configuration, never browser-supplied destinations or credentials.
The endpoint for signed links must be reachable by the browser.

## API

- POST /api/optimizations/:id/documents generates/replaces the pair and returns
  the saved application with documents status, timestamp and template version.
- GET /api/optimizations/:id/documents/docx returns a fresh signed Word download URL.
- GET /api/optimizations/:id/documents/pdf returns a fresh signed PDF download URL.
- DELETE /api/optimizations/:id removes all registered files, then the application.

IDs are validated UUIDs. Only docx/pdf formats are accepted. All API responses use
no-store. The URL is valid for up to five minutes (underlying temporary credentials
may expire earlier); it forces an attachment download and does not expose secrets.
No signed URLs are stored in PostgreSQL. Anyone holding a still-valid URL can use
it. A fresh click generates a fresh URL. Missing objects/storage failures return
safe errors rather than passing provider diagnostics to the browser.

The saved page has Generate/Regenerate, Download Word, Download PDF, Refresh status
and a confirmed Delete application action. Download buttons are available only
when the pair is ready. If a request times out, refresh status before retrying.
The server may complete the operation after the browser stops waiting.

## Consistency and recovery

PostgreSQL and Garage do not share one atomic transaction. We coordinate changes
with persisted manifests and states instead of claiming an all-or-nothing commit
across two independent systems:

- Each application has a document status and a five-minute database operation
  lease. Conditional updates prevent overlapping generation/deletion for that
  application across backend processes. Local conversion concurrency is one.
- Before an upload, a DocumentExport manifest records both unique object keys:
  applications/<application-id>/<batch-id>/resume.docx and resume.pdf.
- Both uploads must succeed before a database transaction publishes the new pair.
  A partial failure never marks a new pair ready.
- Existing ready files remain immutable while a replacement is built. Publication
  retires the old batch; subsequent cleanup deletes those obsolete objects.
- Failed uploads are cleaned up. If storage cleanup also fails, the manifest stays
  in PostgreSQL so a later Generate or Delete can retry; the objects are tracked.
- A process crash can leave generating status. After the lease expires, a retry
  cleans the tracked pending/obsolete batches before creating another pair.
  There is no background cleanup daemon or queue in this milestone.
- Regeneration failures preserve a previous ready pair. Its old timestamp remains.
- Delete acquires the same lease, removes every registered object's two keys, and
  only then removes the record/manifests. Partial deletion keeps a delete_failed
  record; downloads and generation are blocked until Delete is retried. Removing
  already-missing objects is idempotent.

Use the application Delete action. Manual SQL row deletion or manual bucket edits
bypass this workflow. A download also checks that its requested object exists.
As with any finite lease, operation timeouts and reasonably synchronized backend
clocks are required; this is not a distributed transaction or an exactly-once job
system. The bounded conversion/network operations are designed to fit the lease.

This remains a shared personal installation without authentication or per-user
ownership. Public multi-user deployment needs authenticated ownership checks on
read, generate, download and delete routes. UUIDs are not access control.

## Limits and temporary files

Only the saved structured content is rendered, revalidated against its schema.
Generated Word/PDF files are bounded to 10 MiB each. LibreOffice runs as a separate
headless process with a unique profile, a 60-second deadline, bounded captured
output, and no shell interpolation. Temporary folders are removed afterward.
Docker runs the API as its existing non-root node user. This is not an OS sandbox.
S3 requests have deadlines; credentials and upstream response bodies are not
returned to clients or printed by the smoke checks.

## Study first

1. resume-renderer.ts: buildResumeDocx sets the layout; ResumeRenderer.render
   converts that exact DOCX to PDF. TEMPLATE_VERSION identifies a saved layout.
2. exports.service.ts: generate, cleanup, download and remove orchestrate the flow.
3. export.repository.ts: acquire/assertLease, begin, publish, fail, finishDelete
   enforce database states and retain manifests for recovery.
4. storage.service.ts: server configuration, uploads/deletes, object existence,
   internal versus public endpoints, and signed downloads.
5. backend/prisma/schema.prisma and 20261025010000_document_exports/migration.sql:
   statuses, manifests, foreign key and one-ready-batch uniqueness.
6. src/components/saved-application.tsx and src/lib/api.ts: buttons, safe retry
   messages, status refresh, fresh URLs and confirmed deletion.

## Tests

- npm run exports:test: real PostgreSQL + renderer + Garage + signed downloads,
  regeneration cleanup, then deletion. Requires local services and LibreOffice.
  Uses a synthetic record in a randomly named isolated database schema and unique
  object keys. On cleanup failure the test schema is retained to track objects.
- backend/test/exports.test.cjs: real PostgreSQL/Nest with storage/rendering failure
  injection: partial uploads, publish failures, failed cleanup, stale leases,
  concurrent operations, regeneration, partial deletion and retry.
- backend/test/renderer.test.cjs: real DOCX generation and PDF conversion for short
  and multi-page text; extracts both formats to check headings, accents, awards
  and final-page content. Optional EXPORT_QA_DIR saves fixtures for visual QA.
- Existing AI/history/parser/private-prompt tests continue to run. CI installs
  LibreOffice/fonts for the renderer checks; it needs neither Garage nor AI keys.
- Local verification: 69 tests passed; the real Garage smoke check passed all
  generate/download/replace/delete checks. Sample export pages were visually
  inspected. Lint and type checks passed. Backend build, Next compilation, TypeScript and page
rendering passed. Final standalone packaging is blocked by recurring Windows
EPERM directory-creation errors even after a clean build; Linux CI must verify
the final packaged build. Docker image builds were not run from this session.

## Files changed in this export step

- backend/src/exports/resume-renderer.ts (new)
- backend/src/exports/storage.service.ts (new)
- backend/src/exports/export.repository.ts (new)
- backend/src/exports/exports.service.ts (new)
- backend/src/exports/exports.controller.ts (new)
- backend/src/exports/README.md (new)
- backend/prisma/schema.prisma
- backend/prisma/migrations/20261025010000_document_exports/migration.sql (new)
- backend/src/database/database.service.ts
- backend/src/app.ts
- backend/package.json and package-lock.json
- package.json
- backend/.env.example
- backend/scripts/storage-setup.cjs
- backend/scripts/export-smoke.cjs (new)
- backend/test/exports.test.cjs (new)
- backend/test/renderer.test.cjs (new)
- Dockerfile.api
- compose.images.yaml
- .github/workflows/ci.yml
- src/types/optimization.ts
- src/lib/api.ts
- src/components/saved-application.tsx
- src/components/application-history.tsx
- src/components/optimization-preview.tsx
- src/components/optimizer-form.tsx
- src/app/globals.css
- README.md
- backend/src/ai/README.md
- backend/src/ai/HISTORY.md
- infra/garage/README.md

Ignored .env.storage-client was generated locally. Private prompts and OpenAI keys
were not changed. Synthetic visual QA files are in ignored generated/. The previous generated build
cache was preserved outside the project under the workspace .build-cache folder.
