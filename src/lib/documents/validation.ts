export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const RESUME_ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Convenience checks only. Future upload handlers must verify actual file contents.
export function validateResume(file: { name: string; size: number } | null): string | null {
  if (!file) return "Choose a resume to continue.";
  if (!/\.(pdf|docx)$/i.test(file.name)) return "Choose a PDF or DOCX file.";
  if (file.size === 0) return "This file is empty. Choose a resume with content.";
  if (file.size > MAX_RESUME_BYTES) return "Your resume must be 5 MB or smaller.";
  return null;
}
