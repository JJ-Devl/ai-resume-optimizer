// Adopt the earlier SQL-only schema without deleting records, then apply migrations.
const { existsSync } = require("node:fs");
const { loadEnvFile } = require("node:process");
const { spawnSync } = require("node:child_process");
const { Pool } = require("pg");
if (existsSync(".env")) loadEnvFile(".env");

function prisma(args, allowed = [0]) {
  const result = spawnSync(
    process.execPath,
    [require.resolve("prisma/build/index.js"), ...args],
    {
      stdio: "inherit",
      env: process.env,
      windowsHide: true,
    },
  );
  if (result.error) throw result.error;
  if (!allowed.includes(result.status))
    throw new Error("Prisma command failed. No database reset was attempted.");
  return result.status;
}
async function setup() {
  if (!process.env.DATABASE_URL)
    throw new Error("Set DATABASE_URL in backend/.env first.");
  const url = new URL(process.env.DATABASE_URL);
  const schema =
    process.env.DATABASE_SCHEMA ?? url.searchParams.get("schema") ?? "public";
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema))
    throw new Error("Invalid database schema.");
  url.searchParams.set("schema", schema);
  process.env.DATABASE_URL = url.toString();
  const pool = new Pool({
    connectionString: url.toString(),
    connectionTimeoutMillis: 5000,
  });
  try {
    const result = await pool.query(
      "SELECT to_regclass($1) AS legacy, to_regclass($2) AS migrations",
      [schema + ".generations", schema + "._prisma_migrations"],
    );
    if (result.rows[0].legacy && !result.rows[0].migrations) {
      console.log(
        "Existing generation table found. Checking it against the Prisma model before baselining.",
      );
      const diff = prisma(
        [
          "migrate",
          "diff",
          "--from-config-datasource",
          "--to-schema",
          "prisma/schema.prisma",
          "--exit-code",
        ],
        [0, 2],
      );
      if (diff !== 0)
        throw new Error(
          "Existing schema differs from the initial Prisma model. Review it manually; no reset or baseline was performed.",
        );
      // migrate diff cannot check CHECK constraints; verify the legacy restrictions separately.
      const constraints = await pool.query(
        "SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = to_regclass($1) AND contype = 'c'",
        [schema + ".generations"],
      );
      const definitions = constraints.rows
        .map((row) => row.definition)
        .join("\n");
      if (
        !definitions.includes("mock_completed") ||
        !definitions.includes("seed") ||
        !definitions.includes("submission")
      ) {
        throw new Error(
          "Expected legacy CHECK constraints are missing. Review the schema before baselining.",
        );
      }
      prisma(["migrate", "resolve", "--applied", "20260919000000_initial"]);
    }
    prisma(["migrate", "deploy"]);
  } finally {
    await pool.end();
  }
}
setup().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
