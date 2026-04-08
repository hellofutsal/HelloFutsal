import {
  IsDefined,
  IsEmail,
  IsString,
  Matches,
  Length,
  ValidateIf,
} from "class-validator";

export class VerifyUserSignupOtpDto {
  @ValidateIf(
    (verifyUserSignupOtpDto: VerifyUserSignupOtpDto) =>
      !verifyUserSignupOtpDto.email && !verifyUserSignupOtpDto.mobileNumber,
  )
  @IsDefined({ message: "Either email or mobile number is required" })
  readonly identifier?: string;

  @ValidateIf((value: VerifyUserSignupOtpDto) => !value.mobileNumber)
  @IsEmail()
  email?: string;

  @ValidateIf((value: VerifyUserSignupOtpDto) => !value.email)
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/)
  mobileNumber?: string;

  @IsString()
  @Length(6, 6)
  otp!: string;
}
