const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Module, ValidationPipe } = require("@nestjs/common");
const { NestFactory } = require("@nestjs/core");
const { AstraClient } = require("../dist/ai/astra.client");
const {
  OptimizationController,
} = require("../dist/ai/optimization.controller");
const { OptimizationService } = require("../dist/ai/optimization.service");
const { DocumentsService } = require("../dist/documents/documents.service");
const { ApiExceptionFilter } = require("../dist/common/api-exception.filter");
const { loadResumePrompt } = require("../dist/ai/resume.prompt");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const { output: polished } = require("./fixtures/resume.cjs");
const { DatabaseService } = require("../dist/database/database.service");
function responseBody(overrides = {}) {
  return {
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              ...polished,
              companyName: "Northstar",
              jobTitle: "Analyst",
            }),
          },
        ],
      },
    ],
    usage: {
      input_tokens: 500,
      output_tokens: 300,
      output_tokens_details: { reasoning_tokens: 100 },
    },
    ...overrides,
  };
}
const { pdf } = require("./fixtures/pdf.cjs");

test("Astra contract and multipart optimization without paid requests", async (t) => {
  const realFetch = global.fetch;
  const oldPromptFile = process.env.RESUME_PROMPT_FILE;
  const promptDirectory = mkdtempSync(join(tmpdir(), "resume-api-prompt-"));
  const promptFile = join(promptDirectory, "test-prompt.txt");
  const privateMarker = "Use the configured test writing style.";
  writeFileSync(promptFile, privateMarker);
  process.env.RESUME_PROMPT_FILE = promptFile;
  const oldKey = process.env.OPENAI_API_KEY,
    oldEnabled = process.env.RESUME_AI_ENABLED;
  process.env.OPENAI_API_KEY = "test-only-not-a-real-key";
  process.env.RESUME_AI_ENABLED = "true";
  let calls = [],
    providerBody = responseBody(),
    providerStatus = 200;
  global.fetch = async (url, options) => {
    if (String(url) !== "https://api.openai.com/v1/responses")
      return realFetch(url, options);
    calls.push(JSON.parse(options.body));
    if (options.signal.aborted) throw new Error("aborted");
    return Response.json(providerBody, { status: providerStatus });
  };
  const saved = [];
  const database = {
    checkApplicationStorage: async () => {},
    saveApplication: async (original, input, optimized) => {
      saved.push({ original, input, optimized });
      return {
        id: "00000000-0000-4000-8000-000000000001",
        createdAt: new Date().toISOString(),
        companyName: "Example",
        jobTitle: "Developer",
        resumeFilename: original.originalFilename,
        model: "gpt-6-astra",
        schemaVersion: 1,
      };
    },
  };
  class TestModule {}
  Module({
    controllers: [OptimizationController],
    providers: [
      OptimizationService,
      AstraClient,
      DocumentsService,
      { provide: DatabaseService, useValue: database },
    ],
  })(TestModule);
  let app;
  try {
    app = await NestFactory.create(TestModule, {
      logger: false,
      abortOnError: false,
    });
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    const post = (
      fields = {
        jobDescription: "Reporting role requiring SQL",
        customPrompt: "Keep it concise.",
        companyName: "Manual company",
        jobTitle: "Manual title",
        jobUrl: "https://example.com/job",
      },
      bytes = pdf(),
    ) => {
      const body = new FormData();
      if (bytes !== null)
        body.append(
          "resume",
          new Blob([bytes], { type: "application/pdf" }),
          "resume.pdf",
        );
      Object.entries(fields).forEach(([key, value]) => body.append(key, value));
      return realFetch(base + "/api/optimizations", { method: "POST", body });
    };
    await t.test(
      "one model call with extracted text and configured private prompt",
      async () => {
        const r = await post(),
          body = await r.json();
        assert.equal(r.status, 201, JSON.stringify(body));
        assert.equal(r.headers.get("cache-control"), "no-store");
        assert.match(body.original.text, /Prepared weekly reports/);
        assert.deepEqual(body.optimized.resume, polished.resume);
        assert.match(body.optimized.resumeText, /CERTIFICATIONS & AWARDS/);
        assert(body.application.id);
        assert.equal(body.saveError, null);
        assert.equal(saved.length, 1);
        assert.equal(saved[0].input.companyName, "Manual company");
        assert.equal(saved[0].input.jobTitle, "Manual title");
        assert.match(saved[0].original.text, /Prepared weekly reports/);
        assert.equal(body.optimized.companyName, "Northstar");
        assert.equal(body.optimized.jobTitle, "Analyst");
        assert.equal(body.optimized.model, "gpt-6-astra");
        assert.deepEqual(body.optimized.usage, {
          inputTokens: 500,
          outputTokens: 300,
          reasoningTokens: 100,
        });
        assert.equal(calls.length, 1);
        assert.equal(calls[0].model, "gpt-6-astra");
        assert.equal(calls[0].store, false);
        assert.equal(calls[0].max_output_tokens, 8000);
        assert.equal(calls[0].reasoning.effort, "medium");
        assert.equal(calls[0].text.format.strict, true);
        assert.equal(calls[0].instructions, loadResumePrompt(promptFile));
        assert(calls[0].instructions.includes(privateMarker));
        assert.equal(JSON.stringify(body).includes(privateMarker), false);
        const input = JSON.parse(calls[0].input);
        assert.match(input.resumeText, /Prepared weekly reports/);
        assert.equal(input.customPrompt, "Keep it concise.");
        assert.equal(
          JSON.stringify(body).includes("test-only-not-a-real-key"),
          false,
        );
      },
    );
    await t.test(
      "invalid private configuration fails before provider without leaking details",
      async () => {
        const before = calls.length;
        process.env.RESUME_PROMPT_FILE = join(
          promptDirectory,
          "missing-private-file.txt",
        );
        try {
          const r = await post();
          const body = await r.json();
          assert.equal(r.status, 503);
          assert.equal(body.error.code, "AI_PROMPT_NOT_CONFIGURED");
          assert.equal(JSON.stringify(body).includes(promptDirectory), false);
          assert.equal(calls.length, before);
        } finally {
          process.env.RESUME_PROMPT_FILE = promptFile;
        }
      },
    );
    await t.test(
      "database preflight prevents charges; save failure preserves paid output",
      async () => {
        const before = calls.length;
        database.checkApplicationStorage = async () => {
          throw new Error("private database diagnostics");
        };
        assert.equal((await post()).status, 503);
        assert.equal(calls.length, before);
        database.checkApplicationStorage = async () => {};
        const originalSave = database.saveApplication;
        database.saveApplication = async () => {
          throw new Error("private SQL diagnostics");
        };
        try {
          const response = await post();
          const body = await response.json();
          assert.equal(response.status, 201);
          assert.equal(body.application, null);
          assert.match(body.saveError, /Copy this draft/);
          assert.deepEqual(body.optimized.resume, polished.resume);
          assert.equal(JSON.stringify(body).includes("private SQL"), false);
        } finally {
          database.saveApplication = originalSave;
        }
      },
    );
    await t.test("invalid fields and file cannot reach provider", async () => {
      const before = calls.length;
      for (const fields of [
        {},
        { jobDescription: " " },
        { jobDescription: "x", resumeText: "spoofed" },
        { jobDescription: "x", model: "other" },
        { jobDescription: "x", jobUrl: "file:///etc/passwd" },
        { jobDescription: "x", customPrompt: "x".repeat(5001) },
        { jobDescription: "x", companyName: "x".repeat(161) },
        { jobDescription: "x", jobTitle: "x".repeat(161) },
      ])
        assert.equal((await post(fields)).status, 400);
      assert.equal((await post({ jobDescription: "x" }, null)).status, 400);
      assert.equal(
        (await post({ jobDescription: "x" }, Buffer.from("fake PDF"))).status,
        415,
      );
      assert.equal(calls.length, before);
    });
    const client = new AstraClient(),
      input = { jobDescription: "SQL role" };
    await t.test("missing key and kill switch prevent requests", async () => {
      const before = calls.length;
      delete process.env.OPENAI_API_KEY;
      await assert.rejects(
        client.optimize("Resume", input, new AbortController().signal),
        (e) => e.getStatus() === 503,
      );
      process.env.OPENAI_API_KEY = "test-only-not-a-real-key";
      process.env.RESUME_AI_ENABLED = "false";
      assert.equal((await post()).status, 503);
      process.env.RESUME_AI_ENABLED = "true";
      assert.equal(calls.length, before);
    });
    for (const [status, code] of [
      [401, "AI_ACCESS_DENIED"],
      [403, "AI_ACCESS_DENIED"],
      [404, "AI_MODEL_UNAVAILABLE"],
      [429, "AI_RATE_LIMITED"],
      [500, "AI_UPSTREAM_ERROR"],
    ])
      await t.test(
        "sanitizes provider HTTP " + status + " without retry",
        async () => {
          providerStatus = status;
          providerBody = { secret: "PRIVATE_UPSTREAM_DETAILS" };
          const before = calls.length;
          await assert.rejects(
            client.optimize("Resume", input, new AbortController().signal),
            (e) =>
              e.getResponse().code === code &&
              !e.message.includes("PRIVATE_UPSTREAM_DETAILS"),
          );
          assert.equal(calls.length, before + 1);
        },
      );
    providerStatus = 200;
    for (const [name, body, code] of [
      ["incomplete", responseBody({ status: "incomplete" }), "AI_INCOMPLETE"],
      [
        "refusal",
        responseBody({
          output: [{ type: "message", content: [{ type: "refusal" }] }],
        }),
        "AI_REFUSED",
      ],
      [
        "bad JSON",
        responseBody({
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: "not json" }],
            },
          ],
        }),
        "AI_INVALID_RESPONSE",
      ],
      [
        "wrong schema",
        responseBody({
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: '{"resumeText":"","changes":[],"skillsAdded":[]}',
                },
              ],
            },
          ],
        }),
        "AI_INVALID_RESPONSE",
      ],
    ])
      await t.test("rejects " + name, async () => {
        providerBody = body;
        await assert.rejects(
          client.optimize("Resume", input, new AbortController().signal),
          (e) => e.getResponse().code === code,
        );
      });
    await t.test("aborted requests have explicit timeout error", async () => {
      const abort = new AbortController();
      abort.abort();
      await assert.rejects(
        client.optimize("Resume", input, abort.signal),
        (e) => e.getResponse().code === "AI_TIMEOUT",
      );
    });
    await t.test("server bounds input and concurrent paid work", async () => {
      let release;
      const blocked = new Promise((resolve) => {
        release = resolve;
      });
      let attempts = 0;
      const service = new OptimizationService(
        {
          extract: async () => ({
            text: "Resume",
            originalFilename: "resume.pdf",
            format: "pdf",
          }),
        },
        {
          assertConfigured() {},
          optimize: async () => {
            attempts++;
            return blocked;
          },
        },
        database,
      );
      const first = service.create(
        undefined,
        input,
        new AbortController().signal,
      );
      await new Promise((resolve) => setImmediate(resolve));
      await assert.rejects(
        service.create(undefined, input, new AbortController().signal),
        (e) => e.getStatus() === 429,
      );
      release(polished);
      await first;
      assert.equal(attempts, 1);
      const tooLong = new OptimizationService(
        { extract: async () => ({ text: "x".repeat(30001) }) },
        {
          assertConfigured() {},
          optimize: async () => {
            throw new Error("must not call");
          },
        },
        database,
      );
      await assert.rejects(
        tooLong.create(undefined, input, new AbortController().signal),
        (e) => e.getResponse().code === "AI_RESUME_TOO_LONG",
      );
    });
  } finally {
    if (app) await app.close();
    if (oldPromptFile === undefined) delete process.env.RESUME_PROMPT_FILE;
    else process.env.RESUME_PROMPT_FILE = oldPromptFile;
    rmSync(promptDirectory, { recursive: true, force: true });
    global.fetch = realFetch;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
    if (oldEnabled === undefined) delete process.env.RESUME_AI_ENABLED;
    else process.env.RESUME_AI_ENABLED = oldEnabled;
  }
});
