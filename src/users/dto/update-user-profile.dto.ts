import { IsDefined, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateUserProfileDto {
  @IsDefined()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;
}
