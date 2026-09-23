import { defineConfig } from "prisma/config";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { databaseConnection } from "./src/database/connection";

if (existsSync(".env")) loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Generation and build do not require a database connection.
  datasource: {
    url: process.env.DATABASE_URL ? databaseConnection().url : undefined,
  },
});
