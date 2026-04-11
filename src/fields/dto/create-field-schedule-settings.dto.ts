import { Type, Transform } from "class-transformer";
import {
  IsDefined,
  IsNumber,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from "class-validator";

export class OperatingHoursDto {
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  openingTime!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  closingTime!: string;
}

export class CreateFieldScheduleSettingsDto {
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  slotDurationMin!: number;

  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  breakBetweenMin!: number;

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
  basePrice!: number;

  @IsDefined()
  @ValidateNested()
  @Type(() => OperatingHoursDto)
  operatingHours!: OperatingHoursDto;
}
