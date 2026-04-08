import {
  IsDefined,
  IsEmail,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from "class-validator";
import { Transform } from "class-transformer";

export class LoginDto {
  @ValidateIf(
    (value: LoginDto) => !value.email && !value.mobileNumber && !value.username,
  )
  @IsDefined({ message: "Provide email, mobileNumber, or username" })
  readonly identifier?: string;

  @ValidateIf((value: LoginDto) => !value.mobileNumber && !value.username)
  @IsEmail()
  email?: string;

  @ValidateIf((value: LoginDto) => !value.email && !value.username)
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @Matches(/^\+?[0-9]{7,15}$/)
  mobileNumber?: string;

  @ValidateIf((value: LoginDto) => !value.email && !value.mobileNumber)
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @MinLength(1)
  username?: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
