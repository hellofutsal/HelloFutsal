import {
  IsUUID,
  IsString,
  IsBoolean,
  IsNumber,
  IsPositive,
  Matches,
  IsArray,
  ArrayNotEmpty,
  ArrayMinSize,
  IsIn,
  IsOptional,
} from "class-validator";

export class CreateMembershipPlanDto {
  @IsString()
  userName!: string;

  @IsString()
  phoneNumber!: string;

  @IsUUID()
  fieldId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @IsIn(
    [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ],
    { each: true },
  )
  daysOfWeek!: string[]; // e.g., ["sunday", "friday"]

  @IsString()
  @Matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: "startTime must be in HH:mm format",
  })
  startTime!: string;

  @IsString()
  @Matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: "endTime must be in HH:mm format",
  })
  endTime!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /**
   * Monthly price for this membership plan.
   * Per-slot price = monthlyPrice / 30 (applied to each matched slot).
   */
  @IsNumber()
  @IsPositive()
  monthlyPrice!: number;
}
