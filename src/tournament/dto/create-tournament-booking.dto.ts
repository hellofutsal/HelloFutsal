import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";

export class CreateTournamentBookingDto {
  @IsNotEmpty()
  @IsString()
  organizerName!: string;

  @IsOptional()
  @IsString()
  organizerPhone?: string;

  @IsNotEmpty()
  @IsString()
  eventName!: string;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsDateString()
  slotDate?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("4", { each: true })
  courts!: string[];

  @IsNotEmpty()
  @IsNumberString()
  totalAmount!: string;

  @IsOptional()
  @IsNumberString()
  advancePaid?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
