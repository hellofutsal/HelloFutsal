import { IsNumberString, IsOptional, IsIn } from "class-validator";

export class CompleteTournamentDto {
  @IsOptional()
  @IsNumberString()
  remainingAmount?: string;

  @IsOptional()
  @IsIn(["cash", "bank_transfer", "online"])
  method?: string;
}
