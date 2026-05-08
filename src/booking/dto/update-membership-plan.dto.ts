import {
  IsOptional,
  IsNumber,
  IsPositive,
  IsArray,
  IsBoolean,
  IsString,
  IsUUID,
  Validate,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
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
  @ValidateNested({ each: true })
  @Type(() => MembershipDayScheduleDto)
  timeRange?: MembershipDayScheduleDto[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @Validate(DateYYYYMMDDConstraint)
  endDate?: string;

  @IsOptional()
  @Validate(DateYYYYMMDDConstraint)
  effectiveFromDate?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  newPrice?: number;
}
