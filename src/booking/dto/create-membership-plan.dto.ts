import {
  IsUUID,
  IsString,
  IsBoolean,
  IsNumber,
  IsPositive,
  Matches,
  IsArray,
  ArrayNotEmpty,
  IsIn,
  IsOptional,
  Validate,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { DateYYYYMMDDConstraint } from "./date-yyyymmdd.constraint";

/**
 * A single time window (slot) with its own pricing
 */
export class MembershipTimeWindowDto {
  @IsString()
  @Matches(/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: "startTime must be in HH:mm format",
  })
  startTime!: string;

  @IsString()
  @Matches(/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: "endTime must be in HH:mm format",
  })
  endTime!: string;
}

/**
 * Day schedule: a day with multiple time windows (slots)
 */
export class MembershipDayScheduleDto {
  @IsString()
  @IsIn([
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ])
  day!: string;

  @IsArray()
  @ArrayNotEmpty()
  slots!: MembershipTimeWindowDto[];
}

export class CreateMembershipPlanDto {
  @IsString()
  userName!: string;

  @IsString()
  phoneNumber!: string;

  @IsUUID()
  fieldId!: string;

  @IsNumber()
  @IsPositive()
  perSlotPrice!: number;

  @IsString()
  @Validate(DateYYYYMMDDConstraint)
  startDate!: string;

  @IsArray()
  @ArrayNotEmpty()
  timeRange!: MembershipDayScheduleDto[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
