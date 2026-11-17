# Astra resume optimization

Generate defaults to one multipart optimization request and a real, billable
GPT-6 Astra call. Development mock scenarios remain selectable and never call AI.
Original and optimized text appear together after success; form values survive errors.
AI output is displayed as escaped plain text with copy, changes, added skills and
token usage. Successful AI results are saved as Application snapshots in PostgreSQL.
History reopens them without another model request. Legacy mock records are retained.
Saved applications now support Word/PDF export and Garage uploads through the
separate [export module](../exports/README.md), without another AI call.

## Request flow

1. Browser checks file metadata and form values.
2. Browser posts the file once plus jobDescription, optional customPrompt and
   jobUrl to POST /api/optimizations as multipart FormData.
3. Nest validates fields and upload limits, then independently extracts file bytes.
   Browser-provided resume text, model names, API keys and system prompts are rejected.
4. AstraClient sends one Responses API request to the fixed OpenAI endpoint:
   gpt-6-astra, medium reasoning, max_output_tokens=8000, store=false and a strict
   JSON schema. No automatic retries or model fallback.
5. Nest checks response status, refusal, JSON shape and text bounds before returning
   original and optimized. The service saves the snapshot and returns its ID.
6. GET /api/optimizations lists metadata; GET /api/optimizations/:id returns the saved
   content without calling AI. All responses use no-store. Raw upstream errors and
   credentials are never returned.

## Private rules and user preferences

The original owner instructions live in backend/prompts/resume.local.txt, ignored
by Git and excluded from Docker builds. Fresh checkouts use a generic public
default. loadResumePrompt reads the private file at runtime and appends the public
JSON contract. RESUME_PROMPT_FILE can select another server-only file; relative
paths resolve from backend/. Invalid configured files fail before a provider call.
See [private prompt setup](../../prompts/README.md) for editing and deployment.

Users customize each submission through Your rules and writing preferences
(customPrompt). This field does not expose or overwrite the server instructions.
Private prompt contents are never sent to the frontend; the model receives them
as instructions. They are not saved in History or embedded in frontend defaults.

## Configuration and costs

OPENAI_API_KEY belongs only in the ignored backend/.env or a backend runtime secret.
RESUME_AI_ENABLED=false disables paid calls. Startup without a key still allows
preview, health, history and mock tests; optimization returns AI_NOT_CONFIGURED.
The backend reads .env when started from its backend working directory.
The key is never read by Next.js, added to images, or passed as a build argument.

For image verification, Compose forwards OPENAI_API_KEY only to the API service.
Use docker compose --env-file backend/.env -f compose.images.yaml up -d after
building the local images. Without that env file or an exported environment key,
the image-test stack deliberately starts without usable AI credentials.

One optimization is allowed at a time per API process. Resume text is capped at
30,000 characters, job description at 30,000 and custom instructions at 5,000.
The output budget includes reasoning tokens; an incomplete response is rejected.
Input/output usage is returned for cost monitoring; reasoning is a subset of
output tokens, not an additional count to add. Calls cancelled or timed out may
still be billed. A manual retry is a new paid request.
Provider deadline is 90 seconds; Next proxy and browser allow 120 seconds for
extraction plus generation. Upstream hosting proxies also need compatible limits.
store=false disables Responses storage; it is not a promise of zero provider retention.

This remains a personal app without authentication. Before exposing paid AI to the
public, add access control and per-user quotas. A concurrency guard is not a
spending cap or authentication.

## Tests and reading order

- resume.schema.ts: structured sections, strict nested validation and text rendering.
- resume.prompt.ts: private-file loader, generic fallback and appended output contract.
- optimization.controller.ts and optimization.dto.ts: multipart endpoint/validation.
- optimization.service.ts: extraction, length and concurrency checks.
- astra.client.ts: actual HTTP call, deadline, error sanitization and output checks.
- src/components/optimizer-form.tsx: original preview, real AI vs mock branch.
- src/components/optimization-preview.tsx: final plain-text result and copy.
- backend/test/ai.test.cjs: real local HTTP tests with a stubbed OpenAI boundary.
  No real key, internet provider request or API credit is required by this suite.

From the repository root:
npm run build --workspace backend
node --test --test-concurrency=1 backend/test/ai.test.cjs backend/test/prompt.test.cjs backend/test/documents.test.cjs
npm run lint
npm run typecheck
npm run build

npm test also runs the existing PostgreSQL suite and requires the test database.
CI never needs an OpenAI secret. Live model tests must be deliberate and use
synthetic content unless the user authorizes sending a real resume.

See [saved-history implementation guide](HISTORY.md) for schema, persistence and UI.
