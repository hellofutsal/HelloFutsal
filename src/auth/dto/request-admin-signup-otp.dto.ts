import {
  IsDefined,
  IsEmail,
  IsString,
  MinLength,
  ValidateIf,
} from "class-validator";
import { Transform } from "class-transformer";

export class RequestAdminSignupOtpDto {
  @ValidateIf(
    (requestAdminSignupOtpDto: RequestAdminSignupOtpDto) =>
      !requestAdminSignupOtpDto.username && !requestAdminSignupOtpDto.ownerName,
  )
  @IsDefined({ message: "Either username or ownerName is required" })
  readonly displayName?: string;

  @ValidateIf((value: RequestAdminSignupOtpDto) => !value.ownerName)
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @MinLength(1)
  username?: string;

  @ValidateIf((value: RequestAdminSignupOtpDto) => !value.username)
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @MinLength(1)
  ownerName?: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
