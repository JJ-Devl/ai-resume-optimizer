import "reflect-metadata";
import { createApp } from "./app";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

async function bootstrap() {
  if (existsSync(".env")) loadEnvFile(".env");
  const app = await createApp();
  app.enableShutdownHooks();
  await app.listen(Number(process.env.API_PORT ?? 3001), "127.0.0.1");
}
void bootstrap();
