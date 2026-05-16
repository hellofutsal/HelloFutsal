import {
  IsArray,
  IsDateString,
  IsOptional,
  IsNumberString,
  IsString,
} from "class-validator";

export class UpdateTournamentBookingDto {
  @IsOptional()
  @IsString()
  organizerName?: string;

  @IsOptional()
  @IsString()
  organizerPhone?: string;

  @IsOptional()
  @IsString()
  eventName?: string;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsArray()
  courts?: string[];

  @IsOptional()
  @IsNumberString()
  totalAmount?: string;

  @IsOptional()
  @IsNumberString()
  advancePaid?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
