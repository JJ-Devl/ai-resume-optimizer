# Resume upload and preview

`validation.ts` checks browser file metadata for early feedback. NestJS
`POST /api/documents/preview` independently checks the actual upload. Send
multipart FormData with one `resume` file and no other fields. Let the browser
set Content-Type and its boundary. Returns `{ text, originalFilename, format }`.

Limits: 5 MiB upload, 200-character filename, 1 file, 0 form fields, 50 PDF pages,
200,000 extracted characters, and 2 concurrent parser processes per API instance.
DOCX entries are streamed before extraction: at most 1,000 entries and 20 MiB
expanded bytes. Duplicate/encrypted entries, invalid paths, and archives missing
required Word parts are rejected. Filename and MIME alone are never trusted.

PDF parsing uses pdf-parse; DOCX raw-text extraction uses Mammoth. Each extraction
runs in a separate process with a 128 MiB JavaScript heap limit and a 15-second
deadline. Native memory is not covered by this heap limit; this is not an OS
security sandbox. No paths or URLs are passed to the parsers. No document bytes
or extracted text are persisted or logged. Responses use Cache-Control: no-store.

Image-only PDFs return an OCR-required message. Images alongside selectable text
do not prevent extraction; image text is not recognized. Empty, corrupt, and
password-protected files return errors. Column reading order may differ from the
original layout. The browser renders escaped plain text, never HTML.

After preview, the browser calls the existing JSON mock endpoint. Its metadata
contract remains backward compatible; a mock history record is not proof of
validated extraction. Future AI work must use validated server content.

Browser preview timeout is 30 seconds; existing mock timeout stays at 8 seconds.
Editing any form field clears stale results; inputs survive failures. A preview
remains available when the subsequent mock history request fails.

Run `npm run build --workspace backend`, then
`node --test backend/test/documents.test.cjs` from the repository root for
database-independent upload tests. `npm test` additionally runs PostgreSQL tests
and requires TEST_DATABASE_URL and a reachable test database.
