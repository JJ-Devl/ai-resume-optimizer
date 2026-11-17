import { DatabaseService } from "../database/database.service";
import { Injectable } from "@nestjs/common";
import { DocumentsService } from "../documents/documents.service";
import { AstraClient, aiError } from "./astra.client";
import { OptimizationDto } from "./optimization.dto";

@Injectable()
export class OptimizationService {
  private active = false;
  constructor(
    private readonly documents: DocumentsService,
    private readonly astra: AstraClient,
    private readonly database: DatabaseService,
  ) {}
  async list() {
    try {
      return { items: await this.database.listApplications(), limit: 50 };
    } catch {
      throw aiError(
        "HISTORY_UNAVAILABLE",
        "Saved history is temporarily unavailable.",
        503,
      );
    }
  }
  async find(id: string) {
    let application;
    try {
      application = await this.database.getApplication(id);
    } catch {
      throw aiError(
        "HISTORY_UNAVAILABLE",
        "Saved history is temporarily unavailable.",
        503,
      );
    }
    if (!application)
      throw aiError(
        "APPLICATION_NOT_FOUND",
        "This saved application was not found.",
        404,
      );
    return application;
  }
  async create(
    file: Express.Multer.File | undefined,
    input: OptimizationDto,
    signal: AbortSignal,
  ) {
    this.astra.assertConfigured();
    if (this.active)
      throw aiError(
        "AI_BUSY",
        "An optimization is already running. Please wait for it to finish.",
        429,
      );
    this.active = true;
    try {
      try {
        await this.database.checkApplicationStorage();
      } catch {
        throw aiError(
          "HISTORY_UNAVAILABLE",
          "Saved history is unavailable. Check PostgreSQL and run database migrations before optimizing.",
          503,
        );
      }
      // Re-extract real bytes, never trust browser-supplied resume text.
      const original = await this.documents.extract(file);
      if (original.text.length > 30000)
        throw aiError(
          "AI_RESUME_TOO_LONG",
          "Use a resume with at most 30,000 extracted characters for AI optimization.",
          422,
        );
      if (signal.aborted)
        throw aiError(
          "REQUEST_CANCELLED",
          "The request was cancelled before optimization.",
          408,
        );
      const optimized = await this.astra.optimize(original.text, input, signal);
      // Preserve the paid result in the response even if saving fails afterward.
      try {
        const application = await this.database.saveApplication(
          original,
          input,
          optimized,
        );
        return { original, optimized, application, saveError: null };
      } catch {
        return {
          original,
          optimized,
          application: null,
          saveError:
            "Optimization completed, but saving failed. Copy this draft before leaving. Do not regenerate just to save it; that makes another paid request.",
        };
      }
    } finally {
      this.active = false;
    }
  }
}
