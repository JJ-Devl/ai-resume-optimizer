# Document boundary

`validation.ts` provides browser-side selection checks only; it does not parse files.
Next milestone: add server-only PDF and DOCX parsers that return `ParsedResume`.
Verify file signatures, enforce request and extracted-text limits, and handle
unreadable, encrypted, and scanned documents explicitly. Repeat all validation
server-side; extensions and browser MIME types are not authoritative.

Keep parsing, structured content, and deterministic export templates separate.
Do not retain uploaded resumes by default or log their contents. Add any local
working files under the ignored `uploads/`, `generated/`, or `temp/` directories.
