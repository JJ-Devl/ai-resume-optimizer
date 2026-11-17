# Structured resumes and saved AI applications

This step adds structured resume content and real PostgreSQL History. The subsequent [export module](../exports/README.md) now generates Word/PDF
files from these saved snapshots and stores them in Garage without another model
call. AWS deployment is separate. Your original private writing rules remain in the ignored local prompt
file. No private rules or candidate customPrompt text are stored in the database.

## Agreed resume sections

1. Contact: name, email, phone, location, links.
2. Professional summary.
3. Skills: categories with items.
4. Experience: employer, title, location, source date strings and bullets.
5. Education: institution, qualification, location, source date strings and details.
6. Projects: name, description, links and bullets (optional).
7. Certifications & Awards: one array with an entry type of certification or award,
   exact name, issuer, date, expiry date where supplied, and details (optional).
8. Languages: name and proficiency where supplied (optional).

Unknown optional strings are empty and absent sections are empty arrays. The
renderer omits empty sections. No particular ScrumMaster credential, date or award
is hardcoded: the actual uploaded resume or candidate-provided information must
supply those facts. Certification validity and team awards can be represented.

Section definitions are the public application contract in resume.schema.ts.
They belong in code so the provider, validator, database and frontend agree. The
private file remains the place for owner writing preferences. The final public
output contract takes precedence over older plain-text output wording in a private
file; it does not replace the private writing rules themselves.

## One request and one paid call

POST /api/optimizations:

1. Validate file metadata and fields; prevent concurrent optimization in this process.
2. Check PostgreSQL/application storage is reachable before a paid call.
3. Validate and extract real uploaded bytes with the existing isolated parser.
4. Call Astra once using the strict nested JSON schema.
5. Validate every nested field/type, reject unexpected properties and oversized
   data, then derive plain text from that validated structure in application code.
6. Atomically insert one Application snapshot, then return original, optimized,
   application (saved metadata), and saveError.

The model returns resume, changes and skillsAdded. It no longer returns a second
plain-text resume. optimized.resumeText is derived locally and stored alongside
optimized.resume, so copy/preview and future document templates share one source.

The new applications table holds an ID, timestamp, schemaVersion, company/role
labels, source filename/format, extracted original text, JD, optional posting URL,
structured resume JSONB, derived plain text, changes/added skills and model/usage.
Company/role labels come from explicit Company: and Role: / Job title: JD lines;
missing labels say not specified. The AI does not invent metadata for the list.
Original uploaded file bytes are not saved.

If storage is unavailable before the call, optimization fails without contacting
Astra. If saving fails after Astra completes, the response still contains the draft
and a clear saveError; it is not labeled saved. Copy it before leaving. Retrying
Generate costs another model call. There is no automatic provider retry. If the
browser times out or disconnects after completion, check History before retrying.

## Reading saved results

- GET /api/optimizations returns the latest 50 metadata-only summaries, newest
  first, with ID as the tie-breaker. It does not return full private source text.
- GET /api/optimizations/:id validates a UUID and returns the snapshot. Unknown IDs
  return 404, malformed IDs return 400, and database errors return safe 503 errors.
- Both endpoints set Cache-Control: no-store and never call the model.
- /history lists real AI applications. Existing mock history is still available
  under Development mock history, with the legacy generation endpoints unchanged.
- /history/[id] shows the saved resume, its JD/URL and original extracted text.
  React displays escaped text. Copy uses the saved plain-text representation.

This is a shared personal installation without login or per-user record ownership.
Do not treat UUIDs as authorization. Authentication/ownership is needed before
exposing personal history publicly. The UI explicitly identifies the shared scope.

## Database migration and compatibility

The committed 20261025000000_saved_applications migration only creates the new
table/index/constraints. Existing generations rows are neither rewritten nor
removed. Run npm run db:setup locally or npm run db:deploy during deployment.
The local migration has already been applied in this workspace.

prisma/legacy.prisma preserves the initial Generation-only schema for safe adoption
of older databases that have no Prisma migration history. db-setup checks against
that baseline, marks only the initial migration applied, and then deploys the new
one. Comparing such a legacy database directly to the expanded current schema
would incorrectly report the new applications table as legacy drift. Existing
adoption/repeated-setup tests cover this path without resetting user data.

## Study in this order

1. resume.schema.ts: RESUME_CONTENT_SCHEMA, parseResumeOutput, renderResumeText.
   This defines the sections and derives display text without another AI call.
2. resume.prompt.ts: loadResumePrompt and the appended output contract. Writing
   rules stay private; structural definitions stay public and versioned.
3. optimization.service.ts: create, database preflight, save and fallback behavior;
   list and find never call Astra.
4. backend/prisma/schema.prisma and the new migration: Application snapshot fields.
5. backend/src/database/database.service.ts: saveApplication, listApplications,
   getApplication and metadata-only selects.
6. src/components/optimizer-form.tsx and optimization-preview.tsx: saved status,
   preview, copy and the link to the saved record.
7. src/components/application-history.tsx and saved-application.tsx: list and detail
   requests. src/app/history/[id]/page.tsx supplies the dynamic route parameter.
8. backend/test/applications.test.cjs: real parser + Nest + PostgreSQL with only
   the model stubbed, restart persistence, bounded history and no paid calls.

## Files changed in this step

- backend/src/ai/resume.schema.ts (new)
- backend/src/ai/resume.prompt.ts
- backend/src/ai/optimization.service.ts
- backend/src/ai/optimization.controller.ts
- backend/src/ai/README.md
- backend/src/ai/HISTORY.md (new)
- backend/src/database/database.service.ts
- backend/src/documents/documents.service.ts (narrows the validated format type)
- backend/prisma/schema.prisma
- backend/prisma/legacy.prisma (new baseline)
- backend/prisma/migrations/20261025000000_saved_applications/migration.sql (new)
- backend/scripts/db-setup.cjs
- backend/test/ai.test.cjs
- backend/test/prompt.test.cjs
- backend/test/applications.test.cjs (new)
- backend/test/resume.test.cjs (new)
- backend/test/fixtures/resume.cjs (new synthetic content)
- backend/test/fixtures/pdf.cjs (extracted shared synthetic PDF fixture)
- backend/prompts/README.md
- src/types/optimization.ts (type-only shared structured contract)
- src/lib/api.ts
- src/lib/documents/README.md
- src/components/optimizer-form.tsx
- src/components/optimization-preview.tsx
- src/components/application-history.tsx (new)
- src/components/saved-application.tsx (new)
- src/components/history-list.tsx
- src/app/history/page.tsx
- src/app/history/[id]/page.tsx (new)
- src/app/page.tsx
- infra/garage/README.md
- README.md

## Verification

57 tests passed, including all existing mock/extraction/private-prompt tests and
new structured content, save-failure, real PostgreSQL and restart-history tests.
Tests create and remove randomly named isolated schemas; user tables are not reset.
All provider calls in tests are stubbed. No paid model request was made.
Lint, frontend/backend type checks and backend build passed.
The local database migration was applied successfully.
The full production build passed, including the dynamic /history/[id] route.
