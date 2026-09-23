/** Browser-side input; the file bytes are not sent in this mock milestone. */
export interface OptimizationInput {
  resume: File;
  jobDescription: string;
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
}
