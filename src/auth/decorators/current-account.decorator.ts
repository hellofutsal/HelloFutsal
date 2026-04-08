import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { AuthenticatedAccount } from "../types/authenticated-account.type";

export const CurrentAccount = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedAccount => {
    const request = context.switchToHttp().getRequest();
    return request.user as AuthenticatedAccount;
  },
);
