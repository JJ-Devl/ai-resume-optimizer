import { HttpException, Injectable } from "@nestjs/common";
import { fork } from "node:child_process";
import { join } from "node:path";

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

@Injectable()
export class DocumentsService {
  private active = 0;

  async extract(file?: Express.Multer.File) {
    const reject = (code: string, message: string, status = 400): never => {
      throw new HttpException({ code, message }, status);
    };
    if (!file) return reject("FILE_REQUIRED", "Choose a PDF or DOCX resume.");
    if (!file.buffer?.length)
      return reject("EMPTY_FILE", "This file is empty.");
    if (file.buffer.length > MAX_RESUME_BYTES)
      return reject(
        "FILE_TOO_LARGE",
        "Your resume must be 5 MB or smaller.",
        413,
      );
    const extension = file.originalname.match(/\.([^.]+)$/)?.[1].toLowerCase();
    if (extension !== "pdf" && extension !== "docx")
      return reject("UNSUPPORTED_FILE", "Choose a PDF or DOCX file.", 415);
    if (
      file.originalname.length > 200 ||
      /[\x00-\x1f/\\]/.test(file.originalname)
    )
      return reject(
        "INVALID_FILENAME",
        "Use a filename of 200 characters or fewer without control characters.",
      );
    if (
      file.mimetype &&
      file.mimetype !== "application/octet-stream" &&
      file.mimetype !== MIME[extension]
    )
      return reject(
        "FILE_TYPE_MISMATCH",
        "The file type does not match its extension.",
        415,
      );
    const signature =
      extension === "pdf"
        ? file.buffer.subarray(0, 5).toString() === "%PDF-"
        : file.buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 3, 4]));
    if (!signature)
      return reject(
        "FILE_TYPE_MISMATCH",
        "The contents are not a valid PDF or DOCX.",
        415,
      );
    if (this.active >= 2)
      return reject(
        "EXTRACTION_BUSY",
        "The preview service is busy. Please try again shortly.",
        429,
      );
    this.active++;
    try {
      const text = await new Promise<string>((resolve, rejectPromise) => {
        // Isolation lets the timeout stop the parser, including CPU-bound work.
        const worker = fork(join(__dirname, "extraction.worker.js"), [], {
          serialization: "advanced",
          execArgv: ["--max-old-space-size=128"],
          stdio: ["ignore", "ignore", "ignore", "ipc"],
          windowsHide: true,
        });
        const timer = setTimeout(() => {
          rejectPromise(
            new HttpException(
              {
                code: "EXTRACTION_TIMEOUT",
                message:
                  "This document took too long to read. Try a simpler document.",
              },
              422,
            ),
          );
          worker.kill();
        }, 15000);
        worker.once("message", (result: { text?: string; error?: string }) => {
          clearTimeout(timer);
          if (typeof result.text === "string") resolve(result.text);
          else
            rejectPromise(
              new HttpException(
                {
                  code: "DOCUMENT_UNREADABLE",
                  message: result.error ?? "Could not read this document.",
                },
                422,
              ),
            );
          worker.kill();
        });
        worker.once("error", () => {
          clearTimeout(timer);
          worker.kill();
          rejectPromise(
            new HttpException(
              {
                code: "DOCUMENT_UNREADABLE",
                message:
                  "Could not read this document. Try exporting it again.",
              },
              422,
            ),
          );
        });
        worker.once("exit", () => {
          clearTimeout(timer);
          rejectPromise(
            new HttpException(
              {
                code: "DOCUMENT_UNREADABLE",
                message: "The document could not be processed.",
              },
              422,
            ),
          );
        });
        worker.send({ bytes: file.buffer, extension });
      });
      return { text, originalFilename: file.originalname, format: extension };
    } finally {
      this.active--;
    }
  }
}
