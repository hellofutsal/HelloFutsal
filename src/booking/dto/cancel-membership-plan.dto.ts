import { Validate } from "class-validator";
import { DateYYYYMMDDConstraint } from "./date-yyyymmdd.constraint";

export class CancelMembershipPlanDto {
  @Validate(DateYYYYMMDDConstraint)
  endDate!: string; // YYYY-MM-DD format
}
