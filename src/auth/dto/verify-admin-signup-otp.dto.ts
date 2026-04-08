import { IsEmail, IsString, Length } from "class-validator";

export class VerifyAdminSignupOtpDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(6, 6)
  otp!: string;
}
