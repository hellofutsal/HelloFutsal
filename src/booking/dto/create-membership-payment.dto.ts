import { IsOptional, IsString, IsUUID, Validate } from "class-validator";
import { DateYYYYMMDDConstraint } from "./date-yyyymmdd.constraint";

export class CreateMembershipPaymentDto {
  @IsUUID()
  membershipPlanId!: string;

  @IsOptional()
  @IsString()
  @Validate(DateYYYYMMDDConstraint)
  periodStartDate?: string;
}
