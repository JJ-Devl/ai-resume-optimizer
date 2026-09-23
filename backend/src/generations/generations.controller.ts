import { Body, Controller, Get, Post } from "@nestjs/common";
import { CreateGenerationDto } from "./create-generation.dto";
import { GenerationsService } from "./generations.service";

@Controller()
export class GenerationsController {
  constructor(private readonly generations: GenerationsService) {}

  @Get("health")
  health() {
    return { status: "ok", mode: "mock" };
  }

  @Get("capabilities")
  capabilities() {
    return this.generations.capabilities();
  }

  @Get("generations")
  history() {
    return this.generations.list();
  }

  @Post("generations")
  create(@Body() input: CreateGenerationDto) {
    return this.generations.create(input);
  }
}
