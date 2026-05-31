import {
  IsIn,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
} from "class-validator";

export class RecordPaymentDto {
  @IsNotEmpty()
  @IsNumberString()
  amount!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsNotEmpty()
  @IsIn(["cash", "bank_transfer", "online"])
  method!: string;
}
