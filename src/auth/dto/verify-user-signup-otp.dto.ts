import { IsDefined, IsString, IsUUID, Length } from "class-validator";

export class VerifyUserSignupOtpDto {
  @IsDefined({ message: "requestId is required" })
  @IsUUID()
  requestId!: string;

  @IsString()
  @Length(6, 6)
  otp!: string;
}
