import {
  ApplicationStatusDto,
  HistoryFilterDto,
} from "./application-status.dto";
import {
  Body,
  Patch,
  Query,
  Controller,
  Header,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { MAX_RESUME_BYTES } from "../documents/documents.service";
import { OptimizationDto } from "./optimization.dto";
import { OptimizationService } from "./optimization.service";

@Controller("optimizations")
export class OptimizationController {
  constructor(private readonly optimization: OptimizationService) {}
  @Get()
  @Header("Cache-Control", "no-store")
  list(@Query() filter: HistoryFilterDto) {
    return this.optimization.list(filter.status);
  }

  @Get(":id")
  @Header("Cache-Control", "no-store")
  find(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.optimization.find(id);
  }

  @Patch(":id/status")
  @Header("Cache-Control", "no-store")
  setApplied(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() input: ApplicationStatusDto,
  ) {
    return this.optimization.setApplied(id, input.applied);
  }

  @Post()
  @Header("Cache-Control", "no-store")
  @UseInterceptors(
    FileInterceptor("resume", {
      limits: {
        fileSize: MAX_RESUME_BYTES,
        files: 1,
        fields: 5,
        parts: 7,
        fieldSize: 120000,
        fieldNameSize: 100,
      },
    }),
  )
  async create(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() input: OptimizationDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const abort = new AbortController();
    const onClose = () => {
      if (!response.writableEnded) abort.abort();
    };
    response.once("close", onClose);
    try {
      return await this.optimization.create(file, input, abort.signal);
    } finally {
      response.off("close", onClose);
    }
  }
}
