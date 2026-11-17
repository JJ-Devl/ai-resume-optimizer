// Explicit local end-to-end check: real PostgreSQL, renderer and Garage; no AI.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { existsSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { loadEnvFile } = require("node:process");
const { Pool } = require("pg");
const { createApp } = require("../dist/app");
const { DatabaseService } = require("../dist/database/database.service");
const { ExportsService } = require("../dist/exports/exports.service");
const { AstraClient } = require("../dist/ai/astra.client");
const { parseResumeOutput } = require("../dist/ai/resume.schema");
const { output } = require("../test/fixtures/resume.cjs");
if (existsSync(".env")) loadEnvFile(".env");
async function main() {
  assert(
    process.env.TEST_DATABASE_URL,
    "Set TEST_DATABASE_URL and start PostgreSQL.",
  );
  const schema = "export_smoke_" + randomUUID().replaceAll("-", "");
  const admin = new Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  let app, id;
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
    assert.equal(result.status, 0, "Test-schema migration failed.");
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.DATABASE_SCHEMA = schema;
    process.env.SEED_DEMO = "false";
    app = await createApp();
    app.get(AstraClient).optimize = () => {
      throw Error("No AI calls allowed");
    };
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl(),
      db = app.get(DatabaseService);
    const saved = await db.saveApplication(
      {
        text: "Synthetic export fixture",
        originalFilename: "synthetic.pdf",
        format: "pdf",
      },
      { jobDescription: "Company: Export Test\nRole: Developer" },
      {
        ...parseResumeOutput(JSON.stringify(output)),
        model: "synthetic-test",
        usage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
      },
    );
    id = saved.id;
    const endpoint = base + "/api/optimizations/" + id;
    const generate = async () => {
      const response = await fetch(endpoint + "/documents", { method: "POST" });
      assert.equal(
        response.status,
        201,
        "Generation endpoint failed; inspect saved document status.",
      );
      const record = await response.json();
      assert.equal(record.documents.status, "ready");
    };
    const link = async (format) => {
      const response = await fetch(endpoint + "/documents/" + format);
      assert.equal(response.status, 200);
      return (await response.json()).url;
    };
    await generate();
    const urls = { docx: await link("docx"), pdf: await link("pdf") };
    for (const format of ["docx", "pdf"]) {
      const response = await fetch(urls[format]);
      assert.equal(response.status, 200);
      assert.match(
        response.headers.get("content-disposition") || "",
        /attachment/,
      );
      const bytes = Buffer.from(await response.arrayBuffer());
      assert(bytes.length > 1000);
      assert.equal(
        bytes.subarray(0, format === "pdf" ? 5 : 2).toString(),
        format === "pdf" ? "%PDF-" : "PK",
      );
    }
    console.log(
      "PASS: saved content generated real Word/PDF, uploaded to Garage, and downloaded through signed links.",
    );
    await generate();
    assert.equal(
      await db.prisma.documentExport.count({ where: { applicationId: id } }),
      1,
    );
    for (const url of Object.values(urls)) {
      const response = await fetch(url);
      await response.body?.cancel();
      assert.equal(response.status, 404);
    }
    console.log(
      "PASS: regeneration replaces the pair and removes old files without calling AI.",
    );
    const finalUrls = [await link("docx"), await link("pdf")];
    assert.equal((await fetch(endpoint, { method: "DELETE" })).status, 200);
    assert.equal((await fetch(endpoint)).status, 404);
    for (const url of finalUrls) {
      const response = await fetch(url);
      await response.body?.cancel();
      assert.equal(response.status, 404);
    }
    id = null;
    console.log(
      "PASS: deletion removes both stored files, export manifest and history record.",
    );
  } finally {
    let clean = true;
    if (app && id) {
      try {
        await app.get(ExportsService).remove(id);
      } catch {
        clean = false;
        console.error(
          "Cleanup could not finish; the isolated test schema was retained to track remaining files.",
        );
      }
    }
    if (app) await app.close();
    if (clean)
      await admin.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
    await admin.end();
  }
}
main().catch(() => {
  console.error(
    "Export smoke check failed. Verify PostgreSQL, Garage, LibreOffice and backend configuration. No credentials, signed URLs or provider bodies were printed.",
  );
  process.exitCode = 1;
});
