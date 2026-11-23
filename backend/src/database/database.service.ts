import type { OptimizationDto } from "../ai/optimization.dto";
import type { OptimizedResume } from "../ai/resume.schema";
import type { Prisma } from "../generated/prisma/client";
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  type Generation as StoredGeneration,
} from "../generated/prisma/client";
import { databaseConnection } from "./connection";

export interface Generation {
  id: string;
  companyName: string;
  jobTitle: string;
  resumeFilename: string;
  createdAt: string;
  status: "mock_completed";
  source: "seed" | "submission";
}

function serialize(row: StoredGeneration): Generation {
  // These values are enforced by PostgreSQL CHECK constraints in the migration.
  if (
    row.status !== "mock_completed" ||
    (row.source !== "seed" && row.source !== "submission")
  ) {
    throw new Error("Unexpected generation status or source.");
  }
  return {
    ...row,
    status: row.status,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  readonly prisma: PrismaClient;

  constructor() {
    const { url, schema } = databaseConnection();
    const adapter = new PrismaPg(
      {
        connectionString: url,
        max: 10,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        statement_timeout: 5000,
      },
      { schema },
    );
    this.prisma = new PrismaClient({ adapter });
  }

  async onModuleInit() {
    await this.prisma.$connect();
    if (
      process.env.NODE_ENV !== "production" &&
      process.env.SEED_DEMO !== "false"
    ) {
      // One atomic insert; repeated or concurrent starts leave existing rows intact.
      await this.prisma.generation.createMany({
        skipDuplicates: true,
        data: [
          {
            id: "demo-1",
            companyName: "Northstar Labs",
            jobTitle: "Frontend Engineer",
            createdAt: new Date("2026-09-16T16:30:00.000Z"),
          },
          {
            id: "demo-2",
            companyName: "Cedar Studio",
            jobTitle: "Full Stack Developer",
            createdAt: new Date("2026-09-15T12:15:00.000Z"),
          },
          {
            id: "demo-3",
            companyName: "Harbor Analytics",
            jobTitle: "Software Engineer",
            createdAt: new Date("2026-09-14T09:00:00.000Z"),
          },
        ].map((item) => ({
          ...item,
          resumeFilename: "fictional-sample-resume.pdf",
          status: "mock_completed",
          source: "seed",
        })),
      });
    }
  }

  async list(): Promise<Generation[]> {
    const rows = await this.prisma.generation.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    });
    return rows.map(serialize);
  }

  async create(
    companyName: string,
    jobTitle: string,
    resumeFilename: string,
  ): Promise<Generation> {
    const row = await this.prisma.generation.create({
      data: {
        companyName,
        jobTitle,
        resumeFilename,
        createdAt: new Date(),
        status: "mock_completed",
        source: "submission",
      },
    });
    return serialize(row);
  }

  async checkApplicationStorage() {
    // Fail before a paid call if PostgreSQL or the required migration is unavailable.
    await this.prisma.application.findFirst({ select: { id: true } });
  }

  async saveApplication(
    original: {
      text: string;
      originalFilename: string;
      format: "pdf" | "docx";
    },
    input: OptimizationDto,
    optimized: OptimizedResume & {
      model: string;
      usage: {
        inputTokens: number;
        outputTokens: number;
        reasoningTokens: number;
      };
    },
  ) {
    const label = (pattern: RegExp, fallback: string) =>
      input.jobDescription.match(pattern)?.[1].trim().slice(0, 160) || fallback;
    const row = await this.prisma.application.create({
      data: {
        companyName:
          input.companyName?.trim() ||
          optimized.companyName?.trim() ||
          label(/^Company:[ \t]*(.+)$/im, "Company not specified"),
        jobTitle:
          input.jobTitle?.trim() ||
          optimized.jobTitle?.trim() ||
          label(/^(?:Role|Job title):[ \t]*(.+)$/im, "Role not specified"),
        resumeFilename: original.originalFilename,
        resumeFormat: original.format,
        originalText: original.text,
        jobDescription: input.jobDescription,
        jobUrl: input.jobUrl || null,
        resume: optimized.resume as Prisma.InputJsonValue,
        resumeText: optimized.resumeText,
        changes: optimized.changes,
        skillsAdded: optimized.skillsAdded,
        model: optimized.model,
        ...optimized.usage,
      },
      select: applicationSummarySelect,
    });
    return { ...row, createdAt: row.createdAt.toISOString() };
  }

  async listApplications(status?: "generated" | "applied") {
    const rows = await this.prisma.application.findMany({
      select: applicationSummarySelect,
      where: status ? { applied: status === "applied" } : undefined,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    });
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async setApplicationApplied(id: string, applied: boolean) {
    const result = await this.prisma.application.updateMany({
      where: { id },
      data: { applied },
    });
    return result.count > 0;
  }

  async getApplication(id: string) {
    const row = await this.prisma.application.findUnique({ where: { id } });
    if (!row) return null;
    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      companyName: row.companyName,
      jobTitle: row.jobTitle,
      resumeFilename: row.resumeFilename,
      schemaVersion: row.schemaVersion,
      documentStatus: row.documentStatus,
      applied: row.applied,
      documents: {
        status: row.documentStatus,
        error: row.documentError,
        generatedAt: row.documentsGeneratedAt?.toISOString() ?? null,
        templateVersion: row.templateVersion,
      },
      jobDescription: row.jobDescription,
      jobUrl: row.jobUrl,
      original: {
        text: row.originalText,
        originalFilename: row.resumeFilename,
        format: row.resumeFormat,
      },
      optimized: {
        resume: row.resume,
        resumeText: row.resumeText,
        changes: row.changes,
        skillsAdded: row.skillsAdded,
        model: row.model,
        usage: {
          inputTokens: row.inputTokens,
          outputTokens: row.outputTokens,
          reasoningTokens: row.reasoningTokens,
        },
      },
    };
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}

const applicationSummarySelect = {
  applied: true,
  id: true,
  createdAt: true,
  companyName: true,
  jobTitle: true,
  resumeFilename: true,
  model: true,
  schemaVersion: true,
  documentStatus: true,
} as const;
