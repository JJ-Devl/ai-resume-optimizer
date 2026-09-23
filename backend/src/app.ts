import { Module, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ApiExceptionFilter } from "./common/api-exception.filter";
import { DatabaseService } from "./database/database.service";
import { GenerationsController } from "./generations/generations.controller";
import { GenerationsService } from "./generations/generations.service";

@Module({
  controllers: [GenerationsController],
  providers: [DatabaseService, GenerationsService],
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
