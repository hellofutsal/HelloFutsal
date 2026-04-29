import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ name: 'DateYYYYMMDD', async: false })
export class DateYYYYMMDDConstraint implements ValidatorConstraintInterface {
  validate(dateString: string) {
    // First check basic format with regex
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return false;
    }

    // Parse the date components
    const [yearStr, monthStr, dayStr] = dateString.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);

    // Check numeric ranges
    if (year < 1900 || year > 2100) return false;
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;

    // Create a Date object and verify it matches the input
    const date = new Date(year, month - 1, day);
    
    // Check if the date is valid and matches the input
    return (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    );
  }

  defaultMessage(args: ValidationArguments) {
    return 'startDate must be a valid calendar date in YYYY-MM-DD format';
  }
}
