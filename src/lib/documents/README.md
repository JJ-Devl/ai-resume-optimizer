# Document boundary

validation.ts provides browser-side selection checks only; it does not parse
files. The current NestJS DTO validates filename and size metadata independently.
No file bytes are uploaded yet.

Next milestone: add upload handling and parsers under backend/src/documents/.
Verify signatures and contents, enforce upload and extracted-text limits, and
handle unreadable, encrypted, and scanned documents explicitly. Filename
extensions and browser MIME types are not authoritative.

Keep parsing, structured content, and deterministic export templates separate.
Do not retain uploads by default or log their contents. Put local working files
under ignored uploads/, generated/, or temp/ directories.
