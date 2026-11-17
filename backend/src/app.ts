import { ExportsController } from "./exports/exports.controller";
import { ExportsService } from "./exports/exports.service";
import { ExportRepository } from "./exports/export.repository";
import { StorageService } from "./exports/storage.service";
import { ResumeRenderer } from "./exports/resume-renderer";
import { Module, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ApiExceptionFilter } from "./common/api-exception.filter";
import { DatabaseService } from "./database/database.service";
import { GenerationsController } from "./generations/generations.controller";
import { GenerationsService } from "./generations/generations.service";
import { DocumentsController } from "./documents/documents.controller";
import { DocumentsService } from "./documents/documents.service";
import { OptimizationController } from "./ai/optimization.controller";
import { OptimizationService } from "./ai/optimization.service";
import { AstraClient } from "./ai/astra.client";

@Module({
  controllers: [
    GenerationsController,
    DocumentsController,
    OptimizationController,
    ExportsController,
  ],
  providers: [
    DatabaseService,
    GenerationsService,
    DocumentsService,
    OptimizationService,
    AstraClient,
    ExportsService,
    ExportRepository,
    StorageService,
    ResumeRenderer,
  ],
})
class AppModule {}

export async function createApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ["error", "warn"],
  });
  app.useBodyParser("json", { limit: "256kb" });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  return app;
}
