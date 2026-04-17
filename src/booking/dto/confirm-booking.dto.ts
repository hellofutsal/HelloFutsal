import { Transform } from "class-transformer";
import { IsNumber, IsOptional, Min } from "class-validator";

export class ConfirmBookingDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }

    if (typeof value === "string") {
      const parsedValue = Number(value.trim());
      return Number.isFinite(parsedValue) ? parsedValue : value;
    }

    return value;
  })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: "extraAmount must be a valid number with up to 2 decimals" },
  )
  @Min(0, { message: "extraAmount cannot be negative" })
  extraAmount?: number;
}
