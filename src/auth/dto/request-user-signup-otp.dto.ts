import {
  IsEmail,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from "class-validator";
import { Transform } from "class-transformer";
import { ExactlyOneOf } from "../validators/exactly-one-of.validator";

export class RequestUserSignupOtpDto {
  @ExactlyOneOf(["email", "mobileNumber"], {
    message: "Provide exactly one of email or mobileNumber",
  })
  readonly identifier?: string;

  @ValidateIf((value: RequestUserSignupOtpDto) => !value.mobileNumber)
  @IsEmail()
  email?: string;

  @ValidateIf((value: RequestUserSignupOtpDto) => !value.email)
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @Matches(/^\+?[0-9]{7,15}$/)
  mobileNumber?: string;

  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @MinLength(1)
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
