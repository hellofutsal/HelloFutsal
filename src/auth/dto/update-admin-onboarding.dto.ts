import { IsDefined, IsInt } from "class-validator";

export class UpdateAdminOnboardingDto {
  @IsDefined()
  @IsInt()
  onboardingNumber!: number;
}
