/** Keep Prisma CLI migrations and runtime queries on the same PostgreSQL schema. */
export function databaseConnection() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required. Copy backend/.env.example to backend/.env.",
    );
  }
  const url = new URL(process.env.DATABASE_URL);
  const schema =
    process.env.DATABASE_SCHEMA ?? url.searchParams.get("schema") ?? "public";
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema))
    throw new Error("Invalid database schema.");
  url.searchParams.set("schema", schema);
  return { url: url.toString(), schema };
}
