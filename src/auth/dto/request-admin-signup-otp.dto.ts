import {
  IsDefined,
  IsEmail,
  IsString,
  Matches,
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

  @ValidateIf(
    (value: RequestAdminSignupOtpDto) => !value.email && !value.mobileNumber,
  )
  @IsDefined({ message: "Either email or mobile number is required" })
  readonly identifier?: string;

  @ValidateIf((value: RequestAdminSignupOtpDto) => value.email !== undefined)
  @IsEmail()
  email?: string;

  @ValidateIf(
    (value: RequestAdminSignupOtpDto) => value.mobileNumber !== undefined,
  )
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @Matches(/^\+?[0-9]{7,15}$/)
  mobileNumber?: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
