import {
  ArrayNotEmpty,
  IsArray,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

class BulkConfirmItem {
  @IsString()
  slotId!: string;
}

export class BulkConfirmBookingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: "totalAmount must be a number with at most 2 decimal places" },
  )
  @IsPositive({ message: "totalAmount must be a positive number" })
  totalAmount?: number;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => BulkConfirmItem)
  bookings!: BulkConfirmItem[];
}
