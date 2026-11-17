import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  ParseUUIDPipe,
  Header,
  HttpException,
} from "@nestjs/common";
import { ExportsService } from "./exports.service";
@Controller("optimizations")
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}
  @Post(":id/documents")
  @Header("Cache-Control", "no-store")
  generate(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.exports.generate(id);
  }
  @Get(":id/documents/:format")
  @Header("Cache-Control", "no-store")
  download(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Param("format") format: string,
  ) {
    if (format !== "pdf" && format !== "docx")
      throw new HttpException(
        { code: "INVALID_DOCUMENT_FORMAT", message: "Choose pdf or docx." },
        400,
      );
    return this.exports.download(id, format);
  }
  @Delete(":id")
  @Header("Cache-Control", "no-store")
  remove(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.exports.remove(id);
  }
}
