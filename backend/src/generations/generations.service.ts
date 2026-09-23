import { HttpException, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { CreateGenerationDto, scenarios } from "./create-generation.dto";

@Injectable()
export class GenerationsService {
  constructor(private readonly database: DatabaseService) {}

  capabilities() {
    return {
      mode: "mock",
      simulationsEnabled:
        process.env.NODE_ENV !== "production" &&
        process.env.MOCK_SCENARIOS !== "false",
      scenarios,
    };
  }

  async list() {
    return { items: await this.database.list(), limit: 50 };
  }

  async create(input: CreateGenerationDto) {
    const scenario = input.scenario ?? "success";
    if (scenario !== "success" && !this.capabilities().simulationsEnabled) {
      throw new HttpException(
        {
          code: "SIMULATION_DISABLED",
          message: "Error simulations are disabled on this server.",
        },
        403,
      );
    }
    const failures = {
      validation: [
        422,
        "RESUME_REJECTED",
        "The mock service could not read this resume. Try another PDF or DOCX.",
      ],
      "rate-limit": [
        429,
        "RATE_LIMITED",
        "Too many requests. Please wait a moment before trying again.",
      ],
      unavailable: [
        503,
        "SERVICE_UNAVAILABLE",
        "The generation service is temporarily unavailable. Please try again shortly.",
      ],
      "server-error": [
        500,
        "GENERATION_FAILED",
        "The server could not complete this request. Please try again.",
      ],
      timeout: [
        504,
        "UPSTREAM_TIMEOUT",
        "The generation service took too long to respond. Please try again.",
      ],
    } as const;
    if (scenario === "slow") {
      // Deliberately outlast the client's 8-second timeout. Never write after a timeout.
      await new Promise((resolve) => setTimeout(resolve, 12000));
      throw new HttpException(
        {
          code: "UPSTREAM_TIMEOUT",
          message: "The simulated slow request timed out.",
        },
        504,
      );
    }
    if (scenario !== "success") {
      const [status, code, message] = failures[scenario];
      throw new HttpException({ code, message }, status);
    }
    // Deterministic placeholders, not AI extraction. Only explicit labels are read.
    const company =
      input.jobDescription
        .match(/^Company:[ \t]*(.+)$/im)?.[1]
        .trim()
        .slice(0, 160) || "Company not specified";
    const role =
      input.jobDescription
        .match(/^(?:Role|Job title):[ \t]*(.+)$/im)?.[1]
        .trim()
        .slice(0, 160) || "Role not specified";
    const generation = await this.database.create(
      company,
      role,
      input.resumeFilename,
    );
    return {
      generation,
      message: "Mock request saved. No AI content or document was generated.",
    };
  }
}
