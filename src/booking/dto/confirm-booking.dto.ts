import { Transform } from "class-transformer";
import { IsNumber, IsOptional, Min, Max } from "class-validator";

// Max value for numeric(12,2) is 9999999999.99
const MAX_EXTRA_AMOUNT = 9999999999.99;

export class ConfirmBookingDto {
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
    { message: "extraAmount must be a valid number with up to 2 decimals" },
  )
  @Min(0, { message: "extraAmount cannot be negative" })
  @Max(MAX_EXTRA_AMOUNT, {
    message: `extraAmount must be ≤ ${MAX_EXTRA_AMOUNT}`,
  })
  extraAmount?: number;
}
