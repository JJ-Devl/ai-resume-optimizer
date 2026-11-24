const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { existsSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { loadEnvFile } = require("node:process");
const { Pool } = require("pg");
const { createApp } = require("../dist/app");
const { AstraClient } = require("../dist/ai/astra.client");
const { DatabaseService } = require("../dist/database/database.service");
const { parseResumeOutput } = require("../dist/ai/resume.schema");
const { output } = require("./fixtures/resume.cjs");
const { pdf } = require("./fixtures/pdf.cjs");
if (existsSync(".env")) loadEnvFile(".env");

test("real application HTTP history persists structured content across restarts", async (t) => {
  assert(
    process.env.TEST_DATABASE_URL,
    "Set TEST_DATABASE_URL and start PostgreSQL.",
  );
  const env = { ...process.env };
  const admin = new Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  const schema = "app_test_" + randomUUID().replaceAll("-", "");
  let app;
  let calls = 0;
  const optimized = {
    ...parseResumeOutput(JSON.stringify(output)),
    model: "gpt-6-astra",
    usage: { inputTokens: 120, outputTokens: 80, reasoningTokens: 20 },
  };
  const start = async () => {
    const instance = await createApp();
    // Stub the model boundary only. Real controller, parser, service and PostgreSQL.
    const client = instance.get(AstraClient);
    client.assertConfigured = () => {};
    client.optimize = async () => {
      calls++;
      return optimized;
    };
    await instance.listen(0, "127.0.0.1");
    return instance;
  };
  try {
    await admin.query('CREATE SCHEMA "' + schema + '"');
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
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.DATABASE_SCHEMA = schema;
    process.env.SEED_DEMO = "false";
    process.env.NODE_ENV = "test";
    app = await start();
    let base = await app.getUrl();
    const post = async (description) => {
      const body = new FormData();
      body.append(
        "resume",
        new Blob([pdf()], { type: "application/pdf" }),
        "resume.pdf",
      );
      body.append("jobDescription", description);
      body.append("customPrompt", "Private candidate preferences.");
      return fetch(base + "/api/optimizations", { method: "POST", body });
    };
    let first;
    await t.test(
      "successful submission saves sections, JD, source text and usage atomically",
      async () => {
        const response = await post(
          "Company: O'Brien Labs\nRole: Engineer\nSQL reporting role",
        );
        first = await response.json();
        assert.equal(response.status, 201, JSON.stringify(first));
        assert.match(first.application.id, /^[a-f0-9-]{36}$/);
        assert.equal(first.application.companyName, "O'Brien Labs");
        assert.equal(first.application.jobTitle, "Engineer");
        assert.equal(first.saveError, null);
        const detailResponse = await fetch(
          base + "/api/optimizations/" + first.application.id,
        );
        assert.equal(detailResponse.headers.get("cache-control"), "no-store");
        const detail = await detailResponse.json();
        assert.deepEqual(
          detail.optimized.resume.certificationsAndAwards,
          output.resume.certificationsAndAwards,
        );
        assert.equal(detail.optimized.resumeText, optimized.resumeText);
        assert.match(detail.jobDescription, /SQL reporting/);
        assert.match(detail.original.text, /Prepared weekly reports/);
        assert.deepEqual(detail.optimized.usage, optimized.usage);
        assert.equal("customPrompt" in detail, false);
        const stored = await admin.query(
          'SELECT resume, original_text, model FROM "' +
            schema +
            '".applications WHERE id=$1',
          [first.application.id],
        );
        assert.deepEqual(stored.rows[0].resume, output.resume);
        assert.equal(calls, 1);
      },
    );
    await t.test(
      "each submission is a separate snapshot; list returns metadata only",
      async () => {
        const second = await (
          await post("Company: Other Company\nRole: Analyst")
        ).json();
        assert.notEqual(second.application.id, first.application.id);
        const response = await fetch(base + "/api/optimizations");
        assert.equal(response.headers.get("cache-control"), "no-store");
        const list = await response.json();
        assert.equal(list.items.length, 2);
        assert.equal(list.items[0].id, second.application.id);
        assert.equal("resume" in list.items[0], false);
        assert.equal("jobDescription" in list.items[0], false);
        assert.equal("customPrompt" in list.items[0], false);
        assert.equal(calls, 2);
      },
    );
    await app.close();
    app = null;
    app = await start();
    base = await app.getUrl();
    await t.test(
      "reopening after a server restart never calls AI",
      async () => {
        const before = calls;
        const detail = await (
          await fetch(base + "/api/optimizations/" + first.application.id)
        ).json();
        assert.equal(detail.optimized.resumeText, optimized.resumeText);
        assert.equal(
          (await (await fetch(base + "/api/optimizations")).json()).items
            .length,
          2,
        );
        assert.equal(calls, before);
        assert.equal(
          (await fetch(base + "/api/optimizations/not-a-uuid")).status,
          400,
        );
        assert.equal(
          (await fetch(base + "/api/optimizations/" + randomUUID())).status,
          404,
        );
      },
    );
    await t.test(
      "job metadata prefers each manual field independently and persists AI fallback",
      async () => {
        const db = app.get(DatabaseService);
        for (const [manual, metadata, expected] of [
          [
            {},
            { companyName: "AI Company", jobTitle: "AI Role" },
            ["AI Company", "AI Role"],
          ],
          [
            { companyName: "  My Company  " },
            { companyName: "AI Company", jobTitle: "AI Role" },
            ["My Company", "AI Role"],
          ],
          [
            { jobTitle: " My Role " },
            { companyName: "AI Company", jobTitle: "AI Role" },
            ["AI Company", "My Role"],
          ],
          [
            { companyName: "  ", jobTitle: "" },
            { companyName: "", jobTitle: "" },
            ["Company not specified", "Role not specified"],
          ],
        ]) {
          const saved = await db.saveApplication(
            {
              text: "Source",
              originalFilename: "fixture.docx",
              format: "docx",
            },
            { jobDescription: "Unlabeled posting", ...manual },
            { ...optimized, ...metadata },
          );
          const detail = await db.getApplication(saved.id);
          assert.deepEqual([detail.companyName, detail.jobTitle], expected);
          const list = await (await fetch(base + "/api/optimizations")).json();
          const item = list.items.find((item) => item.id === saved.id);
          assert.deepEqual([item.companyName, item.jobTitle], expected);
        }
      },
    );
    await t.test("history is bounded to the latest 50 snapshots", async () => {
      const db = app.get(DatabaseService);
      const timestamp = Date.now() + 60000;
      for (let i = 0; i < 51; i++) {
        const saved = await db.saveApplication(
          {
            text: "Synthetic source",
            originalFilename: "fixture.docx",
            format: "docx",
          },
          { jobDescription: "Company: Pagination\nRole: Test " + i },
          optimized,
        );
        // Explicit chronology: fast inserts can share a timestamp, in which
        // case production correctly breaks ties by random UUID, not insertion order.
        await db.prisma.application.update({
          where: { id: saved.id },
          data: { createdAt: new Date(timestamp + i * 1000) },
        });
      }
      const list = await (await fetch(base + "/api/optimizations")).json();
      assert.equal(list.items.length, 50);
      assert.equal(list.limit, 50);
      assert.equal(list.items[0].jobTitle, "Test 50");
      assert.deepEqual(
        list.items.map((item) => item.jobTitle),
        Array.from({ length: 50 }, (_, i) => "Test " + (50 - i)),
      );
      assert.equal(calls, 2);
    });
    await t.test(
      "applied tracking persists, filters before limiting, supports undo and validates input without AI",
      async () => {
        const id = first.application.id;
        const change = (body, target = id) =>
          fetch(base + "/api/optimizations/" + target + "/status", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        const list = async (status) =>
          (
            await (
              await fetch(base + "/api/optimizations?status=" + status)
            ).json()
          ).items;
        assert.equal(
          (await app.get(DatabaseService).getApplication(id)).applied,
          false,
        );
        assert.equal((await change({ applied: true })).status, 200);
        assert.equal((await change({ applied: true })).status, 200);
        assert((await list("applied")).some((item) => item.id === id));
        assert(!(await list("generated")).some((item) => item.id === id));
        await app.close();
        app = await start();
        base = await app.getUrl();
        const detail = await app.get(DatabaseService).getApplication(id);
        assert.equal(detail.applied, true);
        assert.equal(detail.optimized.resumeText, optimized.resumeText);
        assert.equal(detail.documents.status, "not_generated");
        assert.equal((await change({ applied: false })).status, 200);
        assert.equal(
          (await app.get(DatabaseService).getApplication(id)).applied,
          false,
        );
        assert(!(await list("applied")).some((item) => item.id === id));
        for (const body of [
          {},
          { applied: "true" },
          { applied: null },
          { applied: true, extra: 1 },
        ])
          assert.equal((await change(body)).status, 400);
        assert.equal(
          (await change({ applied: true }, randomUUID())).status,
          404,
        );
        assert.equal((await change({ applied: true }, "invalid")).status, 400);
        assert.equal(
          (await fetch(base + "/api/optimizations?status=invalid")).status,
          400,
        );
        assert.equal(calls, 2);
      },
    );
  } finally {
    if (app) await app.close();
    await admin.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
    await admin.end();
    for (const key of [
      "DATABASE_URL",
      "DATABASE_SCHEMA",
      "SEED_DEMO",
      "NODE_ENV",
    ]) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
  }
});
