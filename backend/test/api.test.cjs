const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { existsSync, readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { loadEnvFile } = require("node:process");
const { Pool } = require("pg");
const { createApp } = require("../dist/app");
const { DatabaseService } = require("../dist/database/database.service");

if (existsSync(".env")) loadEnvFile(".env");

function runPrismaSetup(schema) {
  const result = spawnSync(process.execPath, ["scripts/db-setup.cjs"], {
    env: {
      ...process.env,
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      DATABASE_SCHEMA: schema,
    },
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
}

test("HTTP contract, simulations, PostgreSQL persistence, and validation", async (t) => {
  assert.ok(
    process.env.TEST_DATABASE_URL,
    "Set TEST_DATABASE_URL in backend/.env or the environment. Start PostgreSQL with npm run db:up.",
  );
  const admin = new Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  // Generated identifiers only. Never drop or truncate the application's schema.
  const schema = "test_" + randomUUID().replaceAll("-", "");
  const emptySchema = schema + "_empty";
  const legacySchema = schema + "_legacy";
  let app;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`CREATE SCHEMA "${emptySchema}"`);
    await admin.query(`CREATE SCHEMA "${legacySchema}"`);
    runPrismaSetup(schema);
    runPrismaSetup(emptySchema);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.DATABASE_SCHEMA = schema;
    process.env.SEED_DEMO = "true";
    process.env.MOCK_SCENARIOS = "true";
    process.env.NODE_ENV = "test";
    app = await createApp();
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    const valid = {
      resumeFilename: "sample.pdf",
      resumeSize: 100,
      jobDescription: "Company: Example Co\nRole: Engineer\nBuild software.",
    };
    const post = (body) =>
      fetch(base + "/api/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    const history = async () =>
      (await (await fetch(base + "/api/generations")).json()).items;
    await t.test("health and three fictional seed rows", async () => {
      assert.equal((await fetch(base + "/api/health")).status, 200);
      const rows = await history();
      assert.equal(rows.length, 3);
      assert.ok(rows.every((row) => row.source === "seed"));
      assert.equal(rows[0].createdAt, "2026-09-16T16:30:00.000Z");
    });
    await t.test(
      "real HTTP errors from mock scenarios never save records",
      async () => {
        for (const [scenario, expected] of [
          ["validation", 422],
          ["rate-limit", 429],
          ["unavailable", 503],
          ["server-error", 500],
          ["timeout", 504],
        ]) {
          const response = await post({ ...valid, scenario });
          assert.equal(response.status, expected);
          const body = await response.json();
          assert.equal(typeof body.error.message, "string");
          assert.ok(body.error.code);
        }
        assert.equal((await history()).length, 3);
      },
    );
    await t.test(
      "server rejects invalid data independently of the browser",
      async () => {
        for (const patch of [
          { jobDescription: "   " },
          { resumeFilename: "virus.exe" },
          { resumeSize: 0 },
          { resumeSize: 5242881 },
          { resumeSize: "100" },
          { jobUrl: "file:///etc/passwd" },
          { scenario: "unknown" },
          { unexpected: true },
          { customPrompt: "x".repeat(5001) },
        ])
          assert.equal((await post({ ...valid, ...patch })).status, 400);
        assert.equal((await history()).length, 3);
      },
    );
    await t.test(
      "success persists metadata and serializes timestamps",
      async () => {
        const response = await post({
          ...valid,
          customPrompt: "private prompt",
        });
        assert.equal(response.status, 201);
        const result = await response.json();
        assert.equal(result.generation.companyName, "Example Co");
        assert.equal(result.generation.status, "mock_completed");
        const rows = await history();
        assert.equal(rows.length, 4);
        assert.equal(rows[0].id, result.generation.id);
        assert.equal(rows[0].createdAt, result.generation.createdAt);
        assert.equal(rows[0].jobTitle, "Engineer");
        assert.equal("jobDescription" in rows[0], false);
        assert.equal("customPrompt" in rows[0], false);
      },
    );
    await t.test(
      "parameterized SQL preserves quotes and SQL-like text literally",
      async () => {
        const company = "O'Brien'; DROP TABLE generations; --";
        const response = await post({
          ...valid,
          jobDescription: "Company: " + company + "\nRole: Engineer",
        });
        assert.equal(response.status, 201);
        const rows = await history();
        assert.equal(rows.length, 5);
        assert.equal(rows[0].companyName, company);
      },
    );
    await t.test("simulations are rejected in production", async () => {
      process.env.NODE_ENV = "production";
      assert.equal(
        (await post({ ...valid, scenario: "server-error" })).status,
        403,
      );
      const capabilities = await (
        await fetch(base + "/api/capabilities")
      ).json();
      assert.equal(capabilities.simulationsEnabled, false);
      process.env.NODE_ENV = "test";
    });
    await t.test(
      "slow simulation never writes after a client timeout",
      async () => {
        assert.equal((await post({ ...valid, scenario: "slow" })).status, 504);
        assert.equal((await history()).length, 5);
      },
    );
    await app.close();
    app = null;
    await t.test(
      "restart preserves records without duplicating seed rows",
      async () => {
        const db = new DatabaseService();
        try {
          await db.onModuleInit();
          assert.equal((await db.list()).length, 5);
        } finally {
          await db.onModuleDestroy();
        }
      },
    );
    await t.test(
      "seeding can be disabled for a genuinely empty schema",
      async () => {
        process.env.DATABASE_SCHEMA = emptySchema;
        process.env.SEED_DEMO = "false";
        const db = new DatabaseService();
        try {
          await db.onModuleInit();
          assert.deepEqual(await db.list(), []);
        } finally {
          await db.onModuleDestroy();
        }
      },
    );
    await t.test(
      "existing SQL history survives Prisma adoption and repeated setup",
      async () => {
        const client = await admin.connect();
        try {
          await client.query(`SET search_path TO "${legacySchema}"`);
          await client.query(
            readFileSync(
              "prisma/migrations/20260919000000_initial/migration.sql",
              "utf8",
            ),
          );
          await client.query(
            "INSERT INTO generations VALUES ($1,$2,$3,$4,$5,$6,$7)",
            [
              "existing-record",
              "Existing Company",
              "Engineer",
              "sample.pdf",
              new Date(),
              "mock_completed",
              "submission",
            ],
          );
        } finally {
          await client.query("RESET search_path");
          client.release();
        }
        runPrismaSetup(legacySchema);
        runPrismaSetup(legacySchema);
        process.env.DATABASE_SCHEMA = legacySchema;
        const db = new DatabaseService();
        try {
          await db.onModuleInit();
          const records = await db.list();
          assert.equal(records.length, 1);
          assert.equal(records[0].id, "existing-record");
        } finally {
          await db.onModuleDestroy();
        }
      },
    );
  } finally {
    if (app) await app.close();
    try {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.query(`DROP SCHEMA IF EXISTS "${emptySchema}" CASCADE`);
      await admin.query(`DROP SCHEMA IF EXISTS "${legacySchema}" CASCADE`);
    } finally {
      await admin.end();
    }
  }
});
