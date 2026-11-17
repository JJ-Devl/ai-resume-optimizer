const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { existsSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { loadEnvFile } = require("node:process");
const { Pool } = require("pg");
const { createApp } = require("../dist/app");
const { DatabaseService } = require("../dist/database/database.service");
const { ExportRepository } = require("../dist/exports/export.repository");
const { StorageService } = require("../dist/exports/storage.service");
const { ResumeRenderer } = require("../dist/exports/resume-renderer");
const { AstraClient } = require("../dist/ai/astra.client");
const { parseResumeOutput } = require("../dist/ai/resume.schema");
const { output } = require("./fixtures/resume.cjs");
if (existsSync(".env")) loadEnvFile(".env");
test("document manifests, replacement, retries and deletion stay consistent", async (t) => {
  assert(
    process.env.TEST_DATABASE_URL,
    "Start PostgreSQL and set TEST_DATABASE_URL.",
  );
  const oldEnv = { ...process.env };
  const schema = "export_test_" + randomUUID().replaceAll("-", "");
  const admin = new Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  let app;
  try {
    await admin.query('CREATE SCHEMA "' + schema + '"');
    const migration = spawnSync(process.execPath, ["scripts/db-setup.cjs"], {
      env: {
        ...process.env,
        DATABASE_URL: process.env.TEST_DATABASE_URL,
        DATABASE_SCHEMA: schema,
      },
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(migration.status, 0, migration.stdout + migration.stderr);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.DATABASE_SCHEMA = schema;
    process.env.SEED_DEMO = "false";
    app = await createApp();
    app.get(AstraClient).optimize = () => {
      throw Error("Document operations must never call AI");
    };
    const files = new Map();
    const removed = [];
    const storage = app.get(StorageService);
    storage.assertConfigured = () => {};
    let uploadFailure = false,
      removeFailure = false,
      renderFailure = false,
      publishFailure = false;
    storage.upload = async (key, body, format) => {
      if (uploadFailure && format === "pdf")
        throw Error("private upstream details");
      files.set(key, body);
    };
    storage.remove = async (key) => {
      if (removeFailure) throw Error("private deletion details");
      files.delete(key);
      removed.push(key);
    };
    storage.download = async (key, format) => {
      assert(files.has(key));
      return {
        url: "http://example.test/temporary-" + format,
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      };
    };
    app.get(ResumeRenderer).render = async () => {
      if (renderFailure) throw Error("private renderer diagnostics");
      return {
        docx: Buffer.from("word fixture"),
        pdf: Buffer.from("%PDF-fixture"),
      };
    };
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    const db = app.get(DatabaseService);
    const repo = app.get(ExportRepository);
    const summary = await db.saveApplication(
      {
        text: "Synthetic source",
        originalFilename: "fixture.pdf",
        format: "pdf",
      },
      { jobDescription: "Company: Example\nRole: Engineer" },
      {
        ...parseResumeOutput(JSON.stringify(output)),
        model: "test-model",
        usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 },
      },
    );
    const id = summary.id;
    const request = (method, path = "/documents") =>
      fetch(base + "/api/optimizations/" + id + path, { method });
    const detail = () => db.getApplication(id);
    await t.test(
      "no downloads before generation; one pair is published after both uploads",
      async () => {
        assert.equal((await request("GET", "/documents/pdf")).status, 409);
        assert.equal((await request("GET", "/documents/exe")).status, 400);
        const response = await request("POST");
        assert.equal(
          response.status,
          201,
          JSON.stringify(await response.clone().json()),
        );
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal((await response.json()).documents.status, "ready");
        assert.equal(files.size, 2);
        assert.equal(
          (
            await db.prisma.documentExport.findMany({
              where: { applicationId: id },
            })
          ).length,
          1,
        );
        assert.equal((await request("GET", "/documents/pdf")).status, 200);
      },
    );
    let firstKeys = [...files.keys()];
    await t.test(
      "failed replacement keeps the previous pair and cleans partial uploads",
      async () => {
        uploadFailure = true;
        const response = await request("POST");
        assert.equal(response.status, 503);
        assert.equal(
          JSON.stringify(await response.json()).includes("private upstream"),
          false,
        );
        assert.equal((await detail()).documents.status, "ready");
        assert.equal(files.size, 2);
        assert.deepEqual([...files.keys()], firstKeys);
        uploadFailure = false;
        assert.equal((await request("POST")).status, 201);
        assert.equal(files.size, 2);
        assert(firstKeys.every((key) => !files.has(key)));
      },
    );
    await t.test(
      "database publish failure removes new uploads and preserves active files",
      async () => {
        const before = [...files.keys()];
        const publish = repo.publish.bind(repo);
        repo.publish = async () => {
          publishFailure = true;
          throw Error("private database details");
        };
        try {
          assert.equal((await request("POST")).status, 503);
          assert(publishFailure);
          assert.deepEqual([...files.keys()], before);
          assert.equal((await detail()).documents.status, "ready");
        } finally {
          repo.publish = publish;
        }
      },
    );
    await t.test(
      "failed cleanup remains tracked and retry removes leftovers",
      async () => {
        uploadFailure = true;
        removeFailure = true;
        assert.equal((await request("POST")).status, 503);
        assert((await repo.tracked(id)).length > 0);
        assert(files.size > 2);
        uploadFailure = false;
        removeFailure = false;
        assert.equal((await request("POST")).status, 201);
        assert.equal(files.size, 2);
        assert.equal((await repo.tracked(id)).length, 0);
      },
    );
    await t.test(
      "database lease prevents overlapping operations across service instances",
      async () => {
        const lock = await repo.acquire(id);
        try {
          assert.equal((await request("POST")).status, 409);
          assert.equal((await request("DELETE", "")).status, 409);
        } finally {
          await repo.fail(id, lock.token);
          await repo.release(id, lock.token);
        }
      },
    );
    await t.test(
      "expired interrupted attempt is cleaned on retry",
      async () => {
        const lock = await repo.acquire(id);
        const batch = await repo.begin(id, lock.token, "test");
        files.set(batch.docxKey, Buffer.from("interrupted"));
        await db.prisma.application.update({
          where: { id },
          data: { documentLeaseUntil: new Date(0) },
        });
        assert.equal((await request("POST")).status, 201);
        assert.equal(files.size, 2);
        assert(!files.has(batch.docxKey));
      },
    );
    await t.test(
      "renderer failures preserve saved content and active files",
      async () => {
        renderFailure = true;
        assert.equal((await request("POST")).status, 503);
        renderFailure = false;
        assert.equal(files.size, 2);
        assert.equal(
          (await detail()).optimized.resumeText.includes("Second Place"),
          true,
        );
      },
    );
    await t.test(
      "failed deletion retains record and blocks downloads; retry deletes all objects and record",
      async () => {
        removeFailure = true;
        assert.equal((await request("DELETE", "")).status, 503);
        assert.equal((await detail()).documents.status, "delete_failed");
        assert.equal((await request("GET", "/documents/pdf")).status, 409);
        assert.equal((await request("POST")).status, 409);
        removeFailure = false;
        assert.equal((await request("DELETE", "")).status, 200);
        assert.equal(files.size, 0);
        assert.equal(await detail(), null);
        assert.equal((await request("GET", "/documents/pdf")).status, 404);
        assert.equal(
          await db.prisma.documentExport.count({
            where: { applicationId: id },
          }),
          0,
        );
        assert(removed.length > 0);
      },
    );
  } finally {
    if (app) await app.close();
    await admin.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
    await admin.end();
    for (const key of ["DATABASE_URL", "DATABASE_SCHEMA", "SEED_DEMO"]) {
      if (oldEnv[key] === undefined) delete process.env[key];
      else process.env[key] = oldEnv[key];
    }
  }
});
