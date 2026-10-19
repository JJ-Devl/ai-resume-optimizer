import {
  Controller,
  Header,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { DocumentsService, MAX_RESUME_BYTES } from "./documents.service";

@Controller("documents")
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post("preview")
  @Header("Cache-Control", "no-store")
  @UseInterceptors(
    FileInterceptor("resume", {
      limits: { fileSize: MAX_RESUME_BYTES, files: 1, fields: 0, parts: 1 },
    }),
  )
  preview(@UploadedFile() file?: Express.Multer.File) {
    return this.documents.extract(file);
  }
}
