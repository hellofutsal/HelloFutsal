import { Type, Transform } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsDefined,
  IsEnum,
  IsIn,
  IsNumber,
  IsString,
  Length,
  Matches,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";

export enum RuleBookSlotSelectionType {
  ALL_SLOTS = "allSlots",
  SPECIFIC_SLOTS = "specificSlots",
  TIME_RANGE = "timeRange",
}

export enum RuleBookActionType {
  FIXED_PRICE = "fixedPrice",
  PERCENTAGE_DISCOUNT = "percentageDiscount",
}

const WEEKDAY_VALUES = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export class RuleBookTimeRangeDto {
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsIn(WEEKDAY_VALUES, { each: true })
  activeDays!: string[];
}

export class RuleBookSpecificSlotDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  slotDate!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;
}

export class CreateFieldRuleBookDto {
  @IsString()
  @Length(2, 120)
  ruleName!: string;

  @IsEnum(RuleBookSlotSelectionType)
  slotSelectionType!: RuleBookSlotSelectionType;

  @IsEnum(RuleBookActionType)
  actionType!: RuleBookActionType;

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
  value!: number;

  @ValidateIf(
    (dto: CreateFieldRuleBookDto) =>
      dto.slotSelectionType === RuleBookSlotSelectionType.TIME_RANGE,
  )
  @IsDefined()
  @ValidateNested()
  @Type(() => RuleBookTimeRangeDto)
  timeRange?: RuleBookTimeRangeDto;

  @ValidateIf(
    (dto: CreateFieldRuleBookDto) =>
      dto.slotSelectionType === RuleBookSlotSelectionType.SPECIFIC_SLOTS,
  )
  @IsDefined()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RuleBookSpecificSlotDto)
  specificSlots?: RuleBookSpecificSlotDto[];
}
