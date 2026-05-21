import { IsBoolean, IsOptional, IsNumberString } from "class-validator";

export class CancelTournamentDto {
  @IsBoolean()
  refund!: boolean;

  @IsOptional()
  @IsNumberString()
  refundAmount?: string;
}
