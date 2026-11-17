# Private server rules and user prompts

The repository contains a generic public default in src/ai/resume.prompt.ts.
Owner-specific instructions belong in prompts/resume.local.txt, relative to
backend/. This *.local.* file is ignored by Git and excluded from Docker builds.
The original owner prompt has been moved there locally without changing its text.
It is not copied into examples, frontend code, tests, or documentation.

To customize a fresh checkout, create backend/prompts/resume.local.txt as plain
UTF-8 text and write your instructions. Alternatively set RESUME_PROMPT_FILE in
the backend environment to another private UTF-8 file. Relative paths resolve from
backend/, not from the terminal's current directory. A configured path is trusted
server configuration; it is never accepted from browser requests. If you choose
another path, ensure it is ignored by Git and excluded from image builds too.

The file is read on every optimization. Editing its contents takes effect on the
next request. Changing an environment variable still requires restarting NestJS.
Files must be nonempty, regular files at most 64 KiB. A missing optional default
file uses the public fallback. Missing explicitly configured files, unreadable,
empty or oversized files return a generic configuration error before an AI call.
File contents and filesystem details are not returned in that error.

The loader appends the public JSON output contract so private rules and user
preferences remain compatible with the application's response schema. Section
definitions belong in backend/src/ai/resume.schema.ts, not in private files. The
final contract overrides earlier output-format wording without replacing your
private writing rules. Empty optional sections stay empty.

## Per-user customization

The form's Your rules and writing preferences field is the existing customPrompt
input (maximum 5,000 characters). It travels with that submission to NestJS and the
model. Each user can choose tone, language, emphasis and other writing preferences.
It does not edit or expose the private server rules. Custom instructions are not
yet saved between sessions. No endpoint returns the private prompt to the browser.

## Docker

compose.images.yaml mounts this directory read-only at /app/backend/prompts in the
API container. Your ignored local file is available at runtime without entering
the image or its build context. A checkout without that local file still starts
with the generic default. Do not COPY private instructions into a Dockerfile.
Deployments on another host must provision the private file there or mount their
own secret file and set RESUME_PROMPT_FILE to its container path.

## Read first

1. backend/src/ai/resume.prompt.ts: loadResumePrompt, public default and JSON contract.
2. backend/prompts/resume.local.txt: your private editable rules (local only).
3. backend/src/ai/astra.client.ts: loads instructions before calling the provider.
4. src/components/optimizer-form.tsx: customPrompt form field and multipart upload.
5. backend/test/prompt.test.cjs and backend/test/ai.test.cjs: fallback, overrides,
   invalid files, and ensuring private instructions are not in API responses.

## Files changed for private-prompt support

- .gitignore and .dockerignore
- backend/src/ai/resume.prompt.ts and astra.client.ts
- backend/test/ai.test.cjs and prompt.test.cjs
- backend/prompts/README.md
- backend/src/ai/README.md and src/lib/ai/README.md
- src/components/optimizer-form.tsx and optimization-preview.tsx
- compose.images.yaml
- backend/.env.example
- README.md

The local-only backend/prompts/resume.local.txt contains the preserved original
instructions. It is not tracked or included in Docker build contexts.
