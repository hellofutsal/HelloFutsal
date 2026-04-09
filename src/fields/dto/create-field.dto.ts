import { IsOptional, IsString, Length } from "class-validator";

export class CreateFieldDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  city?: string;

  @IsOptional()
  @IsString()
  @Length(2, 255)
  address?: string;

  @IsOptional()
  @IsString()
  @Length(2, 1000)
  description?: string;
}
