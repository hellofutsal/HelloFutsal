import { IsArray, ValidateNested, IsString, IsOptional } from "class-validator";
import { Type } from "class-transformer";

class BulkConfirmItem {
  @IsString()
  slotId!: string;
}

export class BulkConfirmBookingsDto {
  @IsOptional()
  totalAmount?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkConfirmItem)
  bookings!: BulkConfirmItem[];
}
