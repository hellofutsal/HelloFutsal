import { IsNumber, IsPositive, Validate } from "class-validator";
import { DateYYYYMMDDConstraint } from "./date-yyyymmdd.constraint";

export class UpgradeMembershipPriceDto {
  @Validate(DateYYYYMMDDConstraint)
  effectiveFromDate!: string; // YYYY-MM-DD format

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  newPrice!: number;
}
