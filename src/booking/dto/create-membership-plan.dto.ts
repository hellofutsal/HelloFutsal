import {
  IsUUID,
  IsInt,
  IsString,
  IsBoolean,
  Min,
  Max,
  Matches,
} from "class-validator";

export class CreateMembershipPlanDto {
  @IsUUID()
  userId!: string;

  @IsUUID()
  fieldId!: string;

  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number; // 0=Sunday, 6=Saturday

  @IsString()
  @Matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: "startTime must be in HH:mm format",
  })
  startTime!: string;

  @IsString()
  @Matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: "endTime must be in HH:mm format",
  })
  endTime!: string;

  @IsBoolean()
  active!: boolean;
}
