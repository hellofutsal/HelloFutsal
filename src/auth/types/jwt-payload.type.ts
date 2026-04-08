import { AccountRole } from "./account-role.type";

export interface JwtPayload {
  sub: string;
  username?: string;
  email?: string;
  mobileNumber?: string;
  role: AccountRole;
}
