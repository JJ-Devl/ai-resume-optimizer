import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import type { Response } from "express";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const body =
      exception instanceof HttpException ? exception.getResponse() : null;
    let message = "Something went wrong on the server. Please try again.";
    let code = status === 400 ? "INVALID_INPUT" : "SERVER_ERROR";
    if (status === 413) {
      code = "FILE_TOO_LARGE";
      message = "Your resume must be 5 MB or smaller.";
    }
    if (typeof body === "string") message = body;
    if (body && typeof body === "object") {
      const detail = body as { message?: string | string[]; code?: string };
      if (detail.message && status !== 413)
        message = Array.isArray(detail.message)
          ? detail.message.join(" ")
          : detail.message;
      if (detail.code) code = detail.code;
    }
    response
      .status(status)
      .json({ statusCode: status, error: { code, message } });
  }
}
