# AI Resume Optimizer

A Next.js + TypeScript frontend with a NestJS API and a PostgreSQL history
database. This milestone demonstrates a real request/response and persistence
flow using mock generation. No authentication, AI calls, resume parsing, or
document exports are implemented.

## Run locally

Use Node.js 24 LTS and PostgreSQL 17. For the supplied local database setup,
install and start Docker Desktop. From the repository root in PowerShell:

```powershell
npm ci
Copy-Item backend/.env.example backend/.env
npm run db:up
npm run db:setup
npm run dev
```

Copy the environment example only on first setup; do not overwrite your existing
backend/.env. If you already have a PostgreSQL server, skip Docker and set
DATABASE_URL in backend/.env to your existing database connection string.
Create the database first, then run `npm run db:setup` to apply migrations.
The API inserts demo rows on startup but no longer creates tables itself.

Open http://localhost:3000. One command starts both services:

- Next.js frontend: port 3000.
- NestJS backend: port 3001, bound to localhost.
- History: http://localhost:3000/history.

If an old frontend is running, stop it with Ctrl+C first. Both ports should be free.
Prisma migrations create the generations table; the backend inserts three fictional demo
records. Records survive restarts; demo rows are not duplicated. Docker stores
database files in a named volume. `npm run db:down` stops the database without
deleting that volume. Compose binds PostgreSQL to localhost port 5432.
The supplied password is for local development only; use separate credentials
and your provider's TLS requirements for a hosted server.

Optional configuration:

- Copy .env.example to .env.local for Next.js configuration.
- DATABASE_URL in backend/.env configures the API's PostgreSQL connection.
- No API key is required. Restart services after changing configuration.
- Change API_PORT and API_BASE_URL together if changing the backend port.
- SEED_DEMO=false stops inserting demo rows; existing rows are preserved.
- MOCK_SCENARIOS=false disables error simulations. NODE_ENV=production always
  disables simulations and demo seeding, but existing demo records remain.

## Try the milestone

1. Choose a PDF or DOCX (nonempty, up to 5 MB).
2. Paste a job description. For predictable history labels, include:

```text
Company: Example Company
Role: Frontend Engineer

Build accessible React applications with TypeScript.
```

3. Click Generate. A real request goes to NestJS; success saves a mock record.
4. Follow View history. Refresh or restart the server to verify persistence.
5. Expand Test a backend response to select a failure, then click Generate.
   Inputs remain available to retry. Failed simulations do not save records.

The frontend prevents duplicate in-flight submissions and uses an 8-second
timeout. Each new successful submission creates a separate record. If the
connection fails after a real successful write, inspect History before retrying.

### Error scenarios

- Success: HTTP 201 with a saved mock record.
- Resume rejected: HTTP 422.
- Rate limit: HTTP 429.
- Service unavailable: HTTP 503.
- Server error: HTTP 500.
- Backend timeout: HTTP 504.
- Slow connection: the server waits 12 seconds, then fails without writing;
  the browser times out after 8 seconds.

These are deliberate simulations, not real parsing failures or rate limiting.
To test a real unavailable backend, run only npm run dev:web while the API is
stopped. Generate and History show connection errors. Start npm run dev:api and
retry; reload Create to discover the available simulation controls.

## API

All endpoints are prefixed with /api:

- GET /health: service status.
- GET /capabilities: mock mode and whether error simulations are enabled.
- GET /generations: latest 50 records, newest first.
- POST /generations: validate JSON, simulate an outcome, and save on success.

Example JSON:

```json
{
  "resumeFilename": "example.pdf",
  "resumeSize": 1024,
  "jobDescription": "Company: Example Company\nRole: Engineer",
  "scenario": "success"
}
```

Optional jobUrl must be HTTP(S); optional customPrompt is limited to 5,000
characters. Job descriptions are limited to 30,000 characters. Unknown fields,
unknown scenarios, missing required data, and invalid types return HTTP 400.
Errors use { "statusCode": 400, "error": { "code": "...", "message": "..." } }.

The selected file's bytes are NOT uploaded. The API receives only its filename
and size plus form text. It checks metadata, not file authenticity.
Only company, role, filename, ID, timestamp, source, and mock status are persisted.
Job description, URL, custom prompt, and resume contents are not stored.
Explicit Company: and Role: / Job title: lines supply labels; otherwise labels
say "not specified". This is not AI extraction.

## Structure and request flow

```text
src/
  app/                   Next.js pages, styling, /history
  components/            Form, shared navigation, history list
  lib/api.ts             Fetch, timeout, and error handling
  lib/documents/         Browser file metadata checks
  lib/ai/                Future AI boundary
  types/                 Frontend data contracts
backend/
  src/main.ts            API startup and environment loading
  src/app.ts             Nest module, request validation, error filter
  src/generations/       Controller, DTO, mock orchestration
  prisma/schema.prisma  Generation model and database column mappings
  prisma/migrations/    Versioned SQL migrations, committed to Git
  prisma.config.ts      Prisma CLI configuration and connection settings
  scripts/db-setup.cjs   Safe first-time migration / legacy adoption
  src/database/          Prisma queries, demo seeding, connection settings
  src/generated/prisma/ Generated Prisma Client, ignored by Git
  src/common/            Consistent JSON errors
  test/                  HTTP integration and persistence tests
compose.yaml             Local PostgreSQL service and persistent volume
.github/workflows/        Frontend/backend CI
```

Browser form → /api/generations → Next.js proxy → NestJS controller → validated
DTO → service → database → JSON response → success/error UI.

History uses the same proxy and database. NestJS owns the backend logic.
The backend uses Prisma ORM 7 with its PostgreSQL adapter (pg remains the driver).
DatabaseService calls `prisma.generation.findMany`, `create`, and `createMany`.
Database operations are asynchronous. Timestamps use PostgreSQL TIMESTAMPTZ and
are returned to the frontend as ISO strings. Prisma maps camelCase fields to the
existing snake_case database columns. The initial migration retains the existing
CHECK constraints; Prisma's schema language does not describe these constraints.

### Prisma workflow

- `npm run db:setup`: apply committed migrations to a new database. For an existing
  table from the previous milestone, first verify its shape with Prisma Migrate
  Diff, check for the legacy restrictions, then baseline the initial migration.
  Existing records are retained. A mismatched schema stops setup; it never resets
  the database. Run setup once at a time while the API is stopped.
- After editing schema.prisma: `npm run db:migrate -- --name describe_change`
  creates and applies a development migration. Review and commit the SQL.
- `npm run prisma:generate`: refresh the TypeScript client after schema edits.
  Backend dev, typecheck, and build already run this automatically.
- `npm run db:deploy`: apply committed migrations in deployment, before starting
  the API. It does not create new migrations or seed demo records.
- `npm run db:studio`: open Prisma's database viewer locally.

Migration creation may need permission to create a shadow database; the local
Compose user has it. Keep generated client files out of Git, but commit the
schema and migrations. Generation and builds do not require a running database.

The previous ignored SQLite file, if present, is left untouched and no longer
used. Its records are not automatically imported; PostgreSQL starts with the
three fictional demo records.

## Commands and CI

- npm run dev: start both services and watch for changes.
- npm run db:up: start PostgreSQL with Docker Compose and wait until healthy.
- npm run db:down: stop PostgreSQL while preserving its volume.
- npm run dev:web / npm run dev:api: run services separately.
- npm run lint: lint frontend and backend source.
- npm run typecheck: check frontend and backend types.
- npm test: real HTTP tests against isolated temporary PostgreSQL schemas.
- npm run build: compile NestJS and create the Next.js production build.
- npm start: serve the built frontend.
- npm run start:api: serve the built backend in a separate terminal.

GitHub Actions installs the workspace from the root lockfile, then runs lint,
type checking, API tests, and both builds. CI starts a PostgreSQL service container;
no hosted database account or API key is required.
Locally, set TEST_DATABASE_URL in backend/.env and start PostgreSQL before testing.
Tests require permission to create schemas. They create randomly named schemas
and drop only those schemas afterward; they never truncate application tables.
Tests cover seeded history, server validation, error responses, successful writes,
SQL parameterization, production simulation restrictions, delayed failure, restart persistence, and
empty history. Tests also apply migrations on fresh schemas and verify existing
history survives baselining and repeated setup. Browser checks cover interaction
and display separately.

The root npm overrides select patched deepmerge-ts and mysql2 versions for
Prisma's tooling dependencies; the application itself uses PostgreSQL only.

## Privacy and next milestones

This is a local, single-user development app. There is no authentication and all
history is shared. Do not expose it publicly with real personal data. Public
deployment needs access controls and actual request/usage limits.

Next: real uploads with server-side signature and content checks; DOCX/PDF parsing;
a server-only AI provider; structured output validation; deterministic export
templates. Keep API keys out of browser code.

Commit source, package-lock.json, and empty environment examples. .gitignore
excludes databases, secrets, private documents, generated output, and dependencies.

References: [NestJS validation](https://docs.nestjs.com/techniques/validation),
[exception filters](https://docs.nestjs.com/exception-filters),
[Prisma with NestJS](https://docs.nestjs.com/recipes/prisma).
