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
    if (typeof body === "string") message = body;
    if (body && typeof body === "object") {
      const detail = body as { message?: string | string[]; code?: string };
      if (detail.message)
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
