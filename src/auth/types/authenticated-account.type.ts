import { AccountRole } from "./account-role.type";

export interface AuthenticatedAccount {
  id: string;
  username?: string;
  email?: string;
  mobileNumber?: string;
  role: AccountRole;
  name?: string;
  onboardingNumber?: number;
  onboardingComplete?: boolean;
}
