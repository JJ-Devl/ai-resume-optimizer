const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { loadResumePrompt, RESUME_PROMPT } = require("../dist/ai/resume.prompt");

test("server prompt supports public default and private overrides", () => {
  const root = mkdtempSync(join(tmpdir(), "resume-prompt-"));
  try {
    assert(loadResumePrompt("", root).startsWith(RESUME_PROMPT));
    mkdirSync(join(root, "prompts"));
    const local = join(root, "prompts/resume.local.txt");
    writeFileSync(local, "Private test preferences.");
    const loaded = loadResumePrompt("", root);
    assert(loaded.startsWith("Private test preferences."));
    assert(loaded.includes("Return resume, changes and skillsAdded"));
    writeFileSync(local, "Updated private preferences.");
    assert(
      loadResumePrompt("", root).startsWith("Updated private preferences."),
    );
    const configured = join(root, "configured.txt");
    writeFileSync(configured, "Configured test preferences.");
    assert(
      loadResumePrompt("configured.txt", root).startsWith(
        "Configured test preferences.",
      ),
    );
    assert(
      loadResumePrompt(configured, root).startsWith(
        "Configured test preferences.",
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("missing configured, empty, oversized and directory prompts fail safely", () => {
  const root = mkdtempSync(join(tmpdir(), "resume-prompt-invalid-"));
  const invalid = (file) =>
    assert.throws(() => loadResumePrompt(file, root), {
      message: "Private prompt configuration is unavailable",
    });
  try {
    invalid("missing.txt");
    invalid(".");
    writeFileSync(join(root, "empty.txt"), "  \n");
    invalid("empty.txt");
    writeFileSync(join(root, "large.txt"), "x".repeat(65537));
    invalid("large.txt");
    mkdirSync(join(root, "prompts"));
    writeFileSync(join(root, "prompts/resume.local.txt"), " ");
    assert.throws(
      () => loadResumePrompt("", root),
      /configuration is unavailable/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
