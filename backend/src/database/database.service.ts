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
  private readonly prisma: PrismaClient;

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

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}
