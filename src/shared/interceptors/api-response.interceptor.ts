import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { ApiResponse } from "../types/api-response.type";

@Injectable()
export class ApiResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    const response = context.switchToHttp().getResponse();

    return next.handle().pipe(
      map((data) => {
        const statusCode = response.statusCode;

        if (
          data &&
          typeof data === "object" &&
          "success" in (data as Record<string, unknown>) &&
          "data" in (data as Record<string, unknown>) &&
          "message" in (data as Record<string, unknown>) &&
          "statusCode" in (data as Record<string, unknown>)
        ) {
          return data as unknown as ApiResponse<T>;
        }

        return {
          success: true,
          data,
          message: "Request successful",
          statusCode,
        };
      }),
    );
  }
}
