import type { OptimizedResume } from "../../backend/src/ai/resume.schema";
/** Browser-side input; resume bytes are uploaded for extraction. */
export interface OptimizationInput {
  resume: File;
  jobDescription: string;
  companyName?: string;
  jobTitle?: string;
  jobUrl?: string;
  customPrompt?: string;
}

export type MockScenario =
  | "success"
  | "validation"
  | "rate-limit"
  | "unavailable"
  | "server-error"
  | "timeout"
  | "slow";

export interface Generation {
  id: string;
  companyName: string;
  jobTitle: string;
  resumeFilename: string;
  createdAt: string;
  status: "mock_completed";
  source: "seed" | "submission";
}

export interface GenerationResponse {
  generation: Generation;
  message: string;
}

/** Future parsers return text; AI services produce content; renderers own layout. */
export interface ParsedResume {
  text: string;
  originalFilename: string;
  format: "pdf" | "docx";
}
export type OptimizedResult = OptimizedResume & {
  model: string;
  usage: { inputTokens: number; outputTokens: number; reasoningTokens: number };
};
export interface ApplicationSummary {
  jobUrl: string | null;
  applied: boolean;
  id: string;
  createdAt: string;
  companyName: string;
  jobTitle: string;
  resumeFilename: string;
  model: string;
  schemaVersion: number;
  documentStatus: string;
}
export interface OptimizationResponse {
  original: ParsedResume;
  optimized: OptimizedResult;
  application: ApplicationSummary | null;
  saveError: string | null;
}
export interface SavedApplication extends ApplicationSummary {
  documents: {
    status: string;
    error: string | null;
    generatedAt: string | null;
    templateVersion: string | null;
  };
  jobDescription: string;
  jobUrl: string | null;
  original: ParsedResume;
  optimized: OptimizedResult;
}
