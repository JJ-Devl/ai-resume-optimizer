/** Browser-side input contract. Keep File objects out of persisted records. */
export interface OptimizationInput {
  resume: File;
  jobDescription: string;
  jobUrl?: string;
  customPrompt?: string;
}

/** Parsers return text; AI services produce content; renderers own layout. */
export interface ParsedResume {
  text: string;
  originalFilename: string;
}
