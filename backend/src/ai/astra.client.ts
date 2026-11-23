import { OPTIMIZATION_SCHEMA, parseOptimizationOutput } from "./resume.schema";
import { HttpException, Injectable } from "@nestjs/common";
import { loadResumePrompt } from "./resume.prompt";
import type { OptimizationDto } from "./optimization.dto";

export const ASTRA_MODEL = "gpt-6-astra";
export const AI_TIMEOUT_MS = 90000;
export function aiError(code: string, message: string, status = 502) {
  return new HttpException({ code, message }, status);
}

@Injectable()
export class AstraClient {
  assertConfigured() {
    if (
      process.env.RESUME_AI_ENABLED === "false" ||
      !process.env.OPENAI_API_KEY?.trim()
    )
      throw aiError(
        "AI_NOT_CONFIGURED",
        "AI optimization is not configured. Set the backend API key and enable AI, then restart the server.",
        503,
      );
  }
  async optimize(
    resumeText: string,
    input: OptimizationDto,
    signal: AbortSignal,
  ) {
    this.assertConfigured();
    let instructions: string;
    try {
      instructions = loadResumePrompt();
    } catch {
      throw aiError(
        "AI_PROMPT_NOT_CONFIGURED",
        "The backend prompt configuration could not be loaded. Contact the server operator.",
        503,
      );
    }
    const combined = AbortSignal.any([
      signal,
      AbortSignal.timeout(AI_TIMEOUT_MS),
    ]);
    try {
      // Fixed trusted origin; no automatic retries of potentially billable calls.
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        signal: combined,
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: ASTRA_MODEL,
          instructions,
          input: JSON.stringify({
            resumeText,
            jobDescription: input.jobDescription,
            customPrompt: input.customPrompt ?? "",
            jobUrl: input.jobUrl ?? "",
          }),
          reasoning: { effort: "medium" },
          max_output_tokens: 8000,
          store: false,
          text: {
            format: {
              type: "json_schema",
              name: "optimized_resume",
              strict: true,
              schema: OPTIMIZATION_SCHEMA,
            },
          },
        }),
      });
      if (!response.ok) {
        // Never expose upstream bodies, which may echo private request data.
        await response.body?.cancel();
        if (response.status === 401 || response.status === 403)
          throw aiError(
            "AI_ACCESS_DENIED",
            "The backend API key cannot access Astra. Check the key and project permissions.",
            503,
          );
        if (response.status === 429)
          throw aiError(
            "AI_RATE_LIMITED",
            "OpenAI rejected the request due to a rate or credit limit. Check API billing and retry later.",
            429,
          );
        if (response.status === 404)
          throw aiError(
            "AI_MODEL_UNAVAILABLE",
            "Astra is not available to this API project.",
            503,
          );
        throw aiError(
          "AI_UPSTREAM_ERROR",
          "OpenAI could not complete the optimization. No automatic retry was made.",
        );
      }
      const data = (await response.json()) as {
        status?: string;
        output?: Array<{
          type?: string;
          content?: Array<{ type?: string; text?: string }>;
        }>;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          output_tokens_details?: { reasoning_tokens?: number };
        };
      };
      if (!Array.isArray(data.output)) throw new Error("Invalid response");
      const content = data.output
        .filter((item) => item.type === "message")
        .flatMap((item) => item.content ?? []);
      if (content.some((item) => item.type === "refusal"))
        throw aiError(
          "AI_REFUSED",
          "The model could not produce a resume for this request. Adjust the supplied content and try again.",
          422,
        );
      if (data.status !== "completed")
        throw aiError(
          "AI_INCOMPLETE",
          "The model did not finish within its output budget. No partial resume was returned. Try a shorter resume or job description.",
          422,
        );
      const result = parseOptimizationOutput(
        content
          .filter((item) => item.type === "output_text")
          .map((item) => item.text ?? "")
          .join(""),
      );
      const count = (value: unknown) =>
        typeof value === "number" && Number.isSafeInteger(value) && value >= 0
          ? value
          : 0;
      return {
        ...result,
        model: ASTRA_MODEL,
        usage: {
          inputTokens: count(data.usage?.input_tokens),
          outputTokens: count(data.usage?.output_tokens),
          reasoningTokens: count(
            data.usage?.output_tokens_details?.reasoning_tokens,
          ),
        },
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (combined.aborted)
        throw aiError(
          "AI_TIMEOUT",
          "Optimization was interrupted or took too long. API charges may still apply; retrying starts a new request.",
          504,
        );
      throw aiError(
        "AI_INVALID_RESPONSE",
        "Could not obtain a valid resume from OpenAI. Your inputs are preserved; no automatic retry was made.",
      );
    }
  }
}
