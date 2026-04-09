import { Transform } from "class-transformer";
import { IsOptional, IsString, Length } from "class-validator";

export class CreateFieldDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsString()
  @Length(2, 80)
  city?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsString()
  @Length(2, 255)
  address?: string;

  @IsOptional()
  @IsString()
  @Length(2, 1000)
  description?: string;
}
