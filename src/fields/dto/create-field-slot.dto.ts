import { Transform } from "class-transformer";
import { IsOptional, IsString, Matches, Min, IsNumber } from "class-validator";

export class CreateFieldSlotDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  slotDate!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return undefined;
      }

      return Number(trimmed);
    }

    return value;
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;
}
