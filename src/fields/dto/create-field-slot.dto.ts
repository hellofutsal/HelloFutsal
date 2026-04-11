import { Transform } from "class-transformer";
import {
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  Min,
  IsNumber,
} from "class-validator";

export class CreateFieldSlotDto {
  @IsDateString()
  slotDate!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? Number(value) : value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;
}
