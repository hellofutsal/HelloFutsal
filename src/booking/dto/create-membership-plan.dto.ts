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
  Validate,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { DateYYYYMMDDConstraint } from "./date-yyyymmdd.constraint";

/**
 * Flexible day schedule: each day can have independent start/end times
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

  @IsString()
  @Validate(DateYYYYMMDDConstraint)
  startDate!: string;

  @IsNumber()
  @IsPositive()
  monthlyPrice!: number;
}

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
  @ValidateNested({ each: true })
  @Type(() => MembershipDayScheduleDto)
  daysOfWeek!: MembershipDayScheduleDto[]; // e.g., [{day: "sunday", startTime: "08:00", endTime: "09:00"}]

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
