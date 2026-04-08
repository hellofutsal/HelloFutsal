import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Response } from "express";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ method: string; url: string }>();
    const isHttpException = exception instanceof HttpException;

    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!isHttpException) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        stack,
      );
    }

    const message = this.extractMessage(exception, statusCode);

    response.status(statusCode).json({
      success: false,
      data: null,
      message,
      statusCode,
    });
  }

  private extractMessage(exception: unknown, statusCode: number): string {
    if (!(exception instanceof HttpException)) {
      if (process.env.NODE_ENV !== "production") {
        if (exception instanceof Error && exception.message) {
          return exception.message;
        }
        return "Unhandled internal exception";
      }

      return statusCode >= HttpStatus.INTERNAL_SERVER_ERROR
        ? "Internal server error"
        : "Request failed";
    }

    const response = exception.getResponse();

    if (typeof response === "string") {
      return response;
    }

    if (response && typeof response === "object") {
      const message = (response as { message?: string | string[] }).message;
      if (Array.isArray(message)) {
        return message.join(", ");
      }
      if (typeof message === "string") {
        return message;
      }
    }

    return exception.message;
  }
}
