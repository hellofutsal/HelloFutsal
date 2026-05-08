import { IsDateString, IsNumber, IsPositive } from "class-validator";

export class UpgradeMembershipPriceDto {
  @IsDateString()
  effectiveFromDate!: string; // YYYY-MM-DD format

  @IsNumber()
  @IsPositive()
  newPrice!: number;
}
