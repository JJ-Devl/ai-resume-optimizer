export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const RESUME_ACCEPT =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Convenience checks only. The upload endpoint independently verifies contents.
export function validateResume(
  file: { name: string; size: number; type?: string } | null,
): string | null {
  if (!file) return "Choose a resume to continue.";
  if (!/\.(pdf|docx)$/i.test(file.name)) return "Choose a PDF or DOCX file.";
  if (file.name.length > 200 || /[\x00-\x1f/\\]/.test(file.name))
    return "Use a filename of 200 characters or fewer without control characters.";
  const expected = /\.pdf$/i.test(file.name)
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (
    file.type &&
    file.type !== "application/octet-stream" &&
    file.type !== expected
  )
    return "The file type does not match its extension. Choose a PDF or DOCX.";
  if (file.size === 0)
    return "This file is empty. Choose a resume with content.";
  if (file.size > MAX_RESUME_BYTES)
    return "Your resume must be 5 MB or smaller.";
  return null;
}
