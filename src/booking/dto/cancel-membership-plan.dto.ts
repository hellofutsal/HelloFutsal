import { IsDateString } from "class-validator";

export class CancelMembershipPlanDto {
  @IsDateString()
  endDate!: string; // YYYY-MM-DD format
}
