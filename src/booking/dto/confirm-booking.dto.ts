import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  Min,
  Max,
  ValidateIf,
} from "class-validator";

// Max value for numeric(12,2) is 9999999999.99
const MAX_TOTAL_AMOUNT = 9999999999.99;

export class ConfirmBookingDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") return false;
      return trimmed === "true";
    }
    return Boolean(value);
  })
  @IsBoolean({ message: "discount must be a boolean value" })
  discount?: boolean;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") return undefined; // treat whitespace as missing
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : value;
    }
    return value;
  })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: "totalAmount must be a valid number with up to 2 decimals" },
  )
  @Min(0, { message: "totalAmount cannot be negative" })
  @Max(MAX_TOTAL_AMOUNT, {
    message: `totalAmount must be ≤ ${MAX_TOTAL_AMOUNT}`,
  })
  @ValidateIf((o) => o.discount === true, {
    message: "totalAmount is required when discount is enabled",
  })
  totalAmount?: number;
}
