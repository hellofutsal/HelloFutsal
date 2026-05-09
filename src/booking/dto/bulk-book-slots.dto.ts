import { Transform } from "class-transformer";
import { IsString, Matches, IsDateString, IsOptional } from "class-validator";

export class BulkBookSlotsDto {
  @IsString()
  @Matches(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    {
      message: "fieldId must be a valid UUID",
    },
  )
  fieldId!: string;

  @IsDateString()
  startDate!: string; // YYYY-MM-DD

  @IsDateString()
  endDate!: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: "startTime must be in HH:mm format",
  })
  startTime?: string; // HH:mm

  @IsOptional()
  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: "endTime must be in HH:mm format",
  })
  endTime?: string; // HH:mm

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Matches(/^.{2,120}$/, {
    message:
      "userName must be longer than or equal to 2 characters and shorter than or equal to 120 characters",
  })
  userName!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/, {
    message: "phoneNumber must be 7 to 15 digits and may start with +",
  })
  phoneNumber!: string;
}
