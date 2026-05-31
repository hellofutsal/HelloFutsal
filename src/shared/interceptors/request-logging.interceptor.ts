import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, url, body, query, params } = req;

    // List of sensitive keys to redact
    const SENSITIVE_KEYS = [
      "password",
      "pass",
      "pwd",
      "token",
      "accessToken",
      "refreshToken",
      "authorization",
      "auth",
      "otp",
      "email",
      "mobile",
      "phone",
      "newPassword",
      "oldPassword",
      "secret",
      "ssn",
      "creditCard",
      "cardNumber",
      "cvv",
      "pin",
      "userId",
      "username",
      "idNumber",
      "dob",
      "dateOfBirth",
      "address",
      "bankAccount",
      "accountNumber",
      "iban",
      "bic",
      "swift",
      "routingNumber",
      "securityCode",
      "apiKey",
      "apiSecret",
      "privateKey",
      "publicKey",
      "session",
      "cookie",
      "set-cookie",
      "cookies",
      "jwt",
      "sessionId",
      "sessionToken",
      "user",
      "user_id",
      "emailAddress",
      "phoneNumber",
      "mobileNumber",
      "admin",
      "adminId",
      "admin_id",
      "adminEmail",
      "adminPassword",
      "adminToken",
      "adminSecret",
      "adminSession",
      "adminSessionId",
      "adminSessionToken",
      "adminJwt",
      "adminApiKey",
      "adminApiSecret",
      "adminPrivateKey",
      "adminPublicKey",
      "adminCookie",
      "adminSetCookie",
      "adminCookies",
      "adminJwt",
      "adminSessionId",
      "adminSessionToken",
      "adminUser",
      "adminUserId",
      "adminEmailAddress",
      "adminPhoneNumber",
      "adminMobileNumber",
      "adminDob",
      "adminDateOfBirth",
      "adminAddress",
      "adminBankAccount",
      "adminAccountNumber",
      "adminIban",
      "adminBic",
      "adminSwift",
      "adminRoutingNumber",
      "adminSecurityCode",
      "adminApiKey",
      "adminApiSecret",
      "adminPrivateKey",
      "adminPublicKey",
      "adminSession",
      "adminCookie",
      "adminSetCookie",
      "adminCookies",
      "adminJwt",
      "adminSessionId",
      "adminSessionToken",
      "adminUser",
      "adminUserId",
      "adminEmailAddress",
      "adminPhoneNumber",
      "adminMobileNumber",
      "adminDob",
      "adminDateOfBirth",
      "adminAddress",
      "adminBankAccount",
      "adminAccountNumber",
      "adminIban",
      "adminBic",
      "adminSwift",
      "adminRoutingNumber",
      "adminSecurityCode",
    ];

    function redact(obj: any, keysToRedact: string[], depth = 0): any {
      if (depth > 3) return "[DEPTH_LIMIT]";
      if (Array.isArray(obj)) {
        return obj.map((item) => redact(item, keysToRedact, depth + 1));
      }
      if (obj && typeof obj === "object") {
        return Object.fromEntries(
          Object.entries(obj).map(([key, value]) => {
            if (keysToRedact.includes(key)) {
              return [key, "[REDACTED]"];
            }
            return [key, redact(value, keysToRedact, depth + 1)];
          }),
        );
      }
      return obj;
    }

    const safeBody = redact(body, SENSITIVE_KEYS);
    const safeQuery = redact(query, SENSITIVE_KEYS);
    const safeParams = redact(params, SENSITIVE_KEYS);

    this.logger.log(
      `ENDPOINT HIT: ${method} ${url} | Body: ${JSON.stringify(safeBody)} | Query: ${JSON.stringify(safeQuery)} | Params: ${JSON.stringify(safeParams)}`,
    );
    return next.handle().pipe(
      tap(() => {
        // Optionally, log response or status here
      }),
    );
  }
}
