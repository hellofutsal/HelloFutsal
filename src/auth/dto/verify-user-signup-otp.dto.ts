import { IsDefined, IsString, Length } from "class-validator";

export class VerifyUserSignupOtpDto {
  @IsDefined({ message: "requestId is required" })
  @IsString()
  requestId!: string;

  @IsString()
  @Length(6, 6)
  otp!: string;
}
