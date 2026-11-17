const { randomBytes } = require("node:crypto");
const {
  existsSync,
  lstatSync,
  readFileSync,
  writeFileSync,
} = require("node:fs");
const { resolve } = require("node:path");
const { parseEnv } = require("node:util");

const target = resolve(__dirname, "../../.env.storage");
if (existsSync(target)) {
  if (lstatSync(target).isSymbolicLink())
    throw new Error("Storage env file must not be a symbolic link.");
  const env = parseEnv(readFileSync(target, "utf8"));
  const valid =
    /^[a-f0-9]{64}$/.test(env.GARAGE_RPC_SECRET ?? "") &&
    /^GK[a-f0-9]{32}$/.test(env.GARAGE_DEFAULT_ACCESS_KEY ?? "") &&
    /^[a-f0-9]{64}$/.test(env.GARAGE_DEFAULT_SECRET_KEY ?? "") &&
    env.GARAGE_DEFAULT_BUCKET === "resume-documents";
  if (!valid)
    throw new Error(
      "Existing .env.storage is incomplete or invalid. Review it locally; setup will not overwrite credentials.",
    );
  console.log("Existing .env.storage kept unchanged.");
} else {
  const text = [
    "# Generated local Garage credentials. Never commit this file.",
    "GARAGE_RPC_SECRET=" + randomBytes(32).toString("hex"),
    "GARAGE_DEFAULT_ACCESS_KEY=GK" + randomBytes(16).toString("hex"),
    "GARAGE_DEFAULT_SECRET_KEY=" + randomBytes(32).toString("hex"),
    "GARAGE_DEFAULT_BUCKET=resume-documents",
    "",
  ].join("\n");
  writeFileSync(target, text, { flag: "wx", mode: 0o600 });
  console.log("Created ignored .env.storage with local Garage credentials.");
}

// Backend-only client credentials: do not pass Garage's RPC secret into the API.
const clientTarget = resolve(__dirname, "../../.env.storage-client");
const source = parseEnv(readFileSync(target, "utf8"));
const clientValues = {
  S3_BUCKET: source.GARAGE_DEFAULT_BUCKET,
  S3_REGION: "garage",
  S3_ACCESS_KEY_ID: source.GARAGE_DEFAULT_ACCESS_KEY,
  S3_SECRET_ACCESS_KEY: source.GARAGE_DEFAULT_SECRET_KEY,
};
if (existsSync(clientTarget)) {
  if (lstatSync(clientTarget).isSymbolicLink())
    throw new Error("Storage client env file must not be a symbolic link.");
  const existing = parseEnv(readFileSync(clientTarget, "utf8"));
  if (
    !Object.entries(clientValues).every(
      ([key, value]) => existing[key] === value,
    )
  )
    throw new Error(
      "Existing storage client credentials differ. Review them locally; no overwrite was made.",
    );
} else {
  writeFileSync(
    clientTarget,
    Object.entries(clientValues)
      .map(([key, value]) => key + "=" + value)
      .join("\n") + "\n",
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    "Created ignored .env.storage-client for backend runtime configuration.",
  );
}
