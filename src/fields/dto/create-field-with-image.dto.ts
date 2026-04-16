import { Transform, Type } from "class-transformer";
import {
  Allow,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from "class-validator";

export class CreateFieldWithImageDto {
  @IsString()
  @Length(2, 120)
  venueName!: string;

  @IsString()
  @Length(2, 100)
  fieldName!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  playerCapacity!: number;

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

  // image file is handled separately as multipart form data
  // and is not validated through class-validator
  @IsOptional()
  @Allow()
  image?: Express.Multer.File;
}
