import { Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    info?: { name?: string; message?: string },
  ): TUser {
    if (info?.name === "TokenExpiredError") {
      throw new UnauthorizedException("Token expired");
    }

    if (err || !user) {
      throw err ?? new UnauthorizedException("Invalid or missing token");
    }

    return user;
  }
}
