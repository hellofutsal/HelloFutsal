import { BadRequestException } from "@nestjs/common";
import { RuleBookActionType } from "../dto/create-field-rule-book.dto";
import { FieldRuleBook } from "../entities/field-rule-book.entity";

export class FieldSlotGenerator {
  static getCurrentDateString(): string {
    return this.getDateString(new Date());
  }

  static getDateStringFromOffset(daysOffset: number): string {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    return this.getDateString(date);
  }

  static getWeekdayFromOffset(daysOffset: number): string {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    return this.getWeekdayName(date);
  }

  static generateSlotsFromScheduleSettings(
    slotDate: string,
    openingTime: string,
    closingTime: string,
    slotDurationMin: number,
    breakBetweenMin: number,
    basePrice: string,
  ): Array<{
    slotDate: string;
    startTime: string;
    endTime: string;
    price: string;
  }> {
    const slots: Array<{
      slotDate: string;
      startTime: string;
      endTime: string;
      price: string;
    }> = [];

    let currentStart = this.parseTimeToMinutes(openingTime);
    const closingMinutes = this.parseTimeToMinutes(closingTime);

    while (currentStart + slotDurationMin <= closingMinutes) {
      const currentEnd = currentStart + slotDurationMin;
      slots.push({
        slotDate,
        startTime: this.formatMinutesToTime(currentStart),
        endTime: this.formatMinutesToTime(currentEnd),
        price: basePrice,
      });

      currentStart = currentEnd + breakBetweenMin;
    }

    return slots;
  }

  static resolveSlotPriceFromRules(
    slot: { startTime: string; endTime: string },
    weekday: string,
    slotDate: string,
    specificRules: FieldRuleBook[],
    timeRangeRules: FieldRuleBook[],
    allSlotRules: FieldRuleBook[],
    defaultPrice: string,
  ): string {
    const matchedSpecificRule = specificRules.find((ruleBook) => {
      const specificSlots = this.getRuleBookSpecificSlots(ruleBook);
      return specificSlots.some(
        (specificSlot) =>
          specificSlot.activeDays.includes(weekday) &&
          specificSlot.startTime === slot.startTime &&
          specificSlot.endTime === slot.endTime,
      );
    });

    if (matchedSpecificRule) {
      return this.resolvePriceByActionType(matchedSpecificRule, defaultPrice);
    }

    const matchedTimeRangeRule = timeRangeRules.find((ruleBook) => {
      const timeRange = this.getRuleBookTimeRange(ruleBook);
      if (!timeRange.activeDays.includes(weekday)) {
        return false;
      }

      return (
        this.parseTimeToMinutes(slot.startTime) >=
          this.parseTimeToMinutes(timeRange.startTime) &&
        this.parseTimeToMinutes(slot.endTime) <=
          this.parseTimeToMinutes(timeRange.endTime)
      );
    });

    if (matchedTimeRangeRule) {
      return this.resolvePriceByActionType(matchedTimeRangeRule, defaultPrice);
    }

    const matchedAllSlotRule = allSlotRules[0];
    if (matchedAllSlotRule) {
      return this.resolvePriceByActionType(matchedAllSlotRule, defaultPrice);
    }

    return defaultPrice;
  }

  static resolvePriceByActionType(
    ruleBook: FieldRuleBook,
    basePrice: string,
  ): string {
    const actionType = ruleBook.actionType;
    const ruleValue = Number(ruleBook.value);
    const price = Number(basePrice);

    if (Number.isNaN(ruleValue) || Number.isNaN(price)) {
      throw new BadRequestException(
        `Invalid pricing data for rule book ${ruleBook.ruleName}`,
      );
    }

    if (actionType === RuleBookActionType.PERCENTAGE_DISCOUNT) {
      const discountedPrice = price - price * (ruleValue / 100);
      return Math.max(discountedPrice, 0).toFixed(2);
    }

    return ruleValue.toFixed(2);
  }

  static getRuleBookTimeRange(ruleBook: FieldRuleBook): {
    startTime: string;
    endTime: string;
    activeDays: string[];
  } {
    const timeRange = ruleBook.ruleConfig.timeRange as
      | { startTime?: string; endTime?: string; activeDays?: string[] }
      | undefined;

    if (!timeRange?.startTime || !timeRange.endTime || !timeRange.activeDays) {
      throw new BadRequestException(
        `Invalid time range configuration for rule book ${ruleBook.ruleName}`,
      );
    }

    return {
      startTime: timeRange.startTime,
      endTime: timeRange.endTime,
      activeDays: timeRange.activeDays,
    };
  }

  static getRuleBookSpecificSlots(ruleBook: FieldRuleBook): Array<{
    activeDays: string[];
    startTime: string;
    endTime: string;
  }> {
    const specificSlots = ruleBook.ruleConfig.specificSlots as
      | Array<{
          activeDays?: string[];
          startTime?: string;
          endTime?: string;
        }>
      | undefined;

    if (!specificSlots) {
      return [];
    }

    return specificSlots.filter(
      (
        slot,
      ): slot is { activeDays: string[]; startTime: string; endTime: string } =>
        Boolean(
          slot.activeDays &&
          slot.activeDays.length > 0 &&
          slot.startTime &&
          slot.endTime,
        ),
    );
  }

  static parseTimeToMinutes(time: string): number {
    const normalizedTime = time.trim();
    const [hoursText, minutesText] = normalizedTime.split(":");
    const hours = Number(hoursText);
    const minutes = Number(minutesText);

    if (
      Number.isNaN(hours) ||
      Number.isNaN(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      throw new BadRequestException("Invalid time format");
    }

    return hours * 60 + minutes;
  }

  static formatMinutesToTime(totalMinutes: number): string {
    const hours = Math.floor(totalMinutes / 60)
      .toString()
      .padStart(2, "0");
    const minutes = (totalMinutes % 60).toString().padStart(2, "0");

    return `${hours}:${minutes}`;
  }

  private static getDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  private static getWeekdayName(date: Date): string {
    return [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ][date.getDay()];
  }
}
