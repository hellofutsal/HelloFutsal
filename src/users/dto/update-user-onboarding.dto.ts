import { IsDefined, IsIn, IsInt } from "class-validator";

export class UpdateUserOnboardingDto {
  @IsDefined()
  @IsInt()
  @IsIn([1, 2, 3], {
    message: "onboardingNumber must be one of: 1, 2, or 3",
  })
  onboardingNumber!: number;
}
