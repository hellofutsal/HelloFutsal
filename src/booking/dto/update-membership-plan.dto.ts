import {
  IsOptional,
  IsDateString,
  IsNumber,
  IsPositive,
  IsArray,
  IsBoolean,
  IsString,
  IsUUID,
  Validate,
} from "class-validator";
import { MembershipDayScheduleDto } from "./create-membership-plan.dto";
import { DateYYYYMMDDConstraint } from "./date-yyyymmdd.constraint";

export class UpdateMembershipPlanDto {
  @IsOptional()
  @IsString()
  userName?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsUUID()
  fieldId?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  perSlotPrice?: number;

  @IsOptional()
  @IsString()
  @Validate(DateYYYYMMDDConstraint)
  startDate?: string;

  @IsOptional()
  @IsArray()
  timeRange?: MembershipDayScheduleDto[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsDateString()
  effectiveFromDate?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  newPrice?: number;
}
