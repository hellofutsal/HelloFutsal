import { Type, Transform } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsObject,
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
  MULTIPLY = "multiply",
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

const SLOT_SELECTION_TYPE_MAP: Record<string, RuleBookSlotSelectionType> = {
  allslots: RuleBookSlotSelectionType.ALL_SLOTS,
  all_slots: RuleBookSlotSelectionType.ALL_SLOTS,
  specificslots: RuleBookSlotSelectionType.SPECIFIC_SLOTS,
  specific_slots: RuleBookSlotSelectionType.SPECIFIC_SLOTS,
  timerange: RuleBookSlotSelectionType.TIME_RANGE,
  time_range: RuleBookSlotSelectionType.TIME_RANGE,
};

const ACTION_TYPE_MAP: Record<string, RuleBookActionType> = {
  fixedprice: RuleBookActionType.FIXED_PRICE,
  fixed_price: RuleBookActionType.FIXED_PRICE,
  percentagediscount: RuleBookActionType.PERCENTAGE_DISCOUNT,
  percentage_discount: RuleBookActionType.PERCENTAGE_DISCOUNT,
  multiply: RuleBookActionType.MULTIPLY,
};

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]/g, "_");
}

function resolveSlotSelectionType(
  value: unknown,
): RuleBookSlotSelectionType | undefined {
  const rawValue =
    typeof value === "object" && value !== null && "type" in value
      ? (value as { type?: unknown }).type
      : value;

  if (typeof rawValue !== "string") {
    return undefined;
  }

  return SLOT_SELECTION_TYPE_MAP[normalizeToken(rawValue)];
}

function resolveActionType(value: unknown): RuleBookActionType | undefined {
  const rawValue =
    typeof value === "object" && value !== null && "type" in value
      ? (value as { type?: unknown }).type
      : value;

  if (typeof rawValue !== "string") {
    return undefined;
  }

  return ACTION_TYPE_MAP[normalizeToken(rawValue)];
}

function toOptionalNumber(value: unknown): number | undefined {
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

  if (typeof value === "number") {
    return value;
  }

  return undefined;
}

export class RuleBookTimeRangeDto {
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsIn(WEEKDAY_VALUES, { each: true })
  activeDays?: string[];
}

export class RuleBookSpecificSlotDto {
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;
}

export class CreateFieldRuleBookDto {
  @IsOptional()
  @IsObject()
  slot_selection?: { type?: unknown };

  @IsOptional()
  @IsObject()
  price_action?: { type?: unknown; value?: unknown };

  @IsOptional()
  @IsBoolean()
  @Transform(({ value, obj }) => {
    if (value === undefined || value === null) {
      const enabled = (obj as { enabled?: unknown })?.enabled;
      if (typeof enabled === "boolean") {
        return enabled;
      }

      return undefined;
    }

    if (typeof value === "boolean") {
      return value;
    }

    const enabled = (obj as { enabled?: unknown })?.enabled;
    return typeof enabled === "boolean" ? enabled : undefined;
  })
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toOptionalNumber(value))
  priority?: number;

  @ValidateIf(
    (dto: CreateFieldRuleBookDto) =>
      dto.slotSelectionType === RuleBookSlotSelectionType.ALL_SLOTS ||
      dto.slotSelectionType === RuleBookSlotSelectionType.SPECIFIC_SLOTS ||
      dto.slotSelectionType === RuleBookSlotSelectionType.TIME_RANGE,
  )
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsIn(WEEKDAY_VALUES, { each: true })
  @Transform(({ value, obj }) => {
    if (Array.isArray(value)) {
      return value;
    }

    const timeRange = (obj as { timeRange?: { activeDays?: unknown } })
      ?.timeRange;

    if (Array.isArray(timeRange?.activeDays)) {
      return timeRange.activeDays;
    }

    return value;
  })
  activeDays?: string[];

  @IsString()
  @Length(2, 120)
  @Transform(({ value, obj }) => {
    if (typeof value === "string") {
      return value;
    }

    const alias = (obj as { name?: unknown })?.name;
    return typeof alias === "string" ? alias : value;
  })
  ruleName!: string;

  @IsEnum(RuleBookSlotSelectionType)
  @Transform(({ value, obj }) =>
    resolveSlotSelectionType(
      value ??
        (obj as { slotSelection?: unknown; slot_selection?: unknown })
          ?.slotSelection ??
        (obj as { slotSelection?: unknown; slot_selection?: unknown })
          ?.slot_selection,
    ),
  )
  slotSelectionType!: RuleBookSlotSelectionType;

  @IsEnum(RuleBookActionType)
  @Transform(({ value, obj }) =>
    resolveActionType(
      value ??
        (obj as { priceAction?: unknown; price_action?: unknown })
          ?.priceAction ??
        (obj as { priceAction?: unknown; price_action?: unknown })
          ?.price_action,
    ),
  )
  actionType!: RuleBookActionType;

  @Transform(({ value }) => {
    if (value !== undefined && value !== null) {
      return toOptionalNumber(value);
    }

    return undefined;
  })
  @Transform(({ value, obj }) => {
    if (value !== undefined) {
      return value;
    }

    const priceAction = (obj as { priceAction?: { value?: unknown } })
      ?.priceAction;
    const snakePriceAction = (obj as { price_action?: { value?: unknown } })
      ?.price_action;

    return toOptionalNumber(priceAction?.value ?? snakePriceAction?.value);
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
