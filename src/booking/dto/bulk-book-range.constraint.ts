import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";

@ValidatorConstraint({ name: "BulkBookRange", async: false })
export class BulkBookRangeConstraint implements ValidatorConstraintInterface {
  validate(endDate: string, args: ValidationArguments): boolean {
    const dto = args.object as {
      startDate?: string;
      startTime?: string;
      endTime?: string;
    };

    if (!dto.startDate || !endDate) {
      return true;
    }

    const startDateObj = new Date(`${dto.startDate}T00:00:00Z`);
    const endDateObj = new Date(`${endDate}T00:00:00Z`);
    if (
      Number.isNaN(startDateObj.getTime()) ||
      Number.isNaN(endDateObj.getTime())
    ) {
      return false;
    }

    if (endDateObj < startDateObj) {
      return false;
    }

    const dayDiff = Math.floor(
      (endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (dayDiff > 31) {
      return false;
    }

    if (
      dto.startDate === endDate &&
      dto.startTime &&
      dto.endTime &&
      dto.endTime <= dto.startTime
    ) {
      return false;
    }

    return true;
  }

  defaultMessage(): string {
    return "Invalid date/time range: endDate must be on/after startDate, range <= 31 days, and for same-day range endTime must be greater than startTime";
  }
}
