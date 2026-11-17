const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { parseEnv } = require("node:util");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

async function main() {
  const args = new Set(process.argv.slice(2));
  const allowed = new Set([
    "--images",
    "--write-persistence",
    "--read-persistence",
  ]);
  assert(
    [...args].every((arg) => allowed.has(arg)),
    "Unknown storage test option.",
  );
  assert(
    !(args.has("--write-persistence") && args.has("--read-persistence")),
    "Choose one persistence test mode.",
  );
  const env = parseEnv(
    readFileSync(resolve(__dirname, "../../.env.storage"), "utf8"),
  );
  assert(
    env.GARAGE_DEFAULT_ACCESS_KEY &&
      env.GARAGE_DEFAULT_SECRET_KEY &&
      env.GARAGE_DEFAULT_BUCKET,
    "Run npm run storage:setup first.",
  );
  // Always use local endpoints; never send these local credentials to a remote URL.
  const endpoint = args.has("--images")
    ? "http://127.0.0.1:3904"
    : "http://127.0.0.1:3900";
  const client = new S3Client({
    endpoint,
    region: "garage",
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.GARAGE_DEFAULT_ACCESS_KEY,
      secretAccessKey: env.GARAGE_DEFAULT_SECRET_KEY,
    },
    maxAttempts: 1,
  });
  const send = (command) =>
    client.send(command, { abortSignal: AbortSignal.timeout(15000) });
  const text = "Resume Optimizer local storage check\n";
  const persistence =
    args.has("--write-persistence") || args.has("--read-persistence");
  const object = {
    Bucket: env.GARAGE_DEFAULT_BUCKET,
    Key: persistence
      ? "_smoke/persistence.txt"
      : "_smoke/" + randomUUID() + ".txt",
  };
  let cleanup = false;
  const get = async () => {
    const result = await send(new GetObjectCommand(object));
    assert.equal(await result.Body.transformToString(), text);
  };
  try {
    if (args.has("--read-persistence")) {
      await get();
      cleanup = true;
      console.log("PASS: file survived container recreation.");
      return;
    }
    await send(
      new PutObjectCommand({
        ...object,
        Body: text,
        ContentType: "text/plain",
      }),
    );
    cleanup = !args.has("--write-persistence");
    await get();
    console.log("PASS: signed SDK upload and download preserve file contents.");
    if (args.has("--write-persistence")) {
      console.log(
        "Persistence fixture saved. Recreate Garage, then run storage:test -- --read-persistence (add --images for image Compose).",
      );
      return;
    }
    const download = new GetObjectCommand({
      ...object,
      ResponseContentDisposition: 'attachment; filename="storage-test.txt"',
    });
    const url = await getSignedUrl(client, download, { expiresIn: 60 });
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), text);
    assert.match(
      response.headers.get("content-disposition") ?? "",
      /attachment/,
    );
    console.log(
      "PASS: temporary signed download link works with attachment headers.",
    );
    const unsigned = new URL(url);
    unsigned.search = "";
    const anonymous = await fetch(unsigned, {
      signal: AbortSignal.timeout(15000),
    });
    await anonymous.body?.cancel();
    assert.equal(anonymous.status, 403);
    const tampered = new URL(url);
    tampered.searchParams.set("X-Amz-Signature", "0".repeat(64));
    const invalid = await fetch(tampered, {
      signal: AbortSignal.timeout(15000),
    });
    await invalid.body?.cancel();
    assert.equal(invalid.status, 403);
    console.log("PASS: unsigned and tampered download links are rejected.");
    const expiring = await getSignedUrl(client, download, {
      expiresIn: 1,
      // Already expired without a wall-clock sleep or one-second timing race.
      signingDate: new Date(Date.now() - 60 * 1000),
    });
    const expired = await fetch(expiring, {
      signal: AbortSignal.timeout(15000),
    });
    const expiryBody = await expired.text();
    // Garage reports an expired signature as InvalidRequest (400).
    assert.equal(expired.status, 400);
    assert.match(expiryBody, /<Code>InvalidRequest<\/Code>/);
    assert.match(expiryBody, /Date is too old/);
    console.log("PASS: expired download link is rejected.");
  } finally {
    try {
      if (cleanup) {
        await send(new DeleteObjectCommand(object));
        console.log("PASS: test object deleted.");
      }
    } finally {
      client.destroy();
    }
  }
}
main().catch((error) => {
  // Do not print SDK errors, credentials, signed URLs, or provider response bodies.
  const kind =
    error instanceof assert.AssertionError
      ? "assertion"
      : "connection/configuration";
  console.error(
    "Storage smoke test failed (" +
      kind +
      "). Check Docker Desktop, storage:up, and the selected Compose port. No credentials or signed URLs were printed.",
  );
  process.exitCode = 1;
});
