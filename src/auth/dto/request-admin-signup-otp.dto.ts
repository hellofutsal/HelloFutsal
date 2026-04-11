import {
  IsEmail,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from "class-validator";
import { Transform } from "class-transformer";
import { ExactlyOneOf } from "../validators/exactly-one-of.validator";

export class RequestAdminSignupOtpDto {
  @ExactlyOneOf(["username", "ownerName"], {
    message: "Provide exactly one of username or ownerName",
  })
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

  @ExactlyOneOf(["email", "mobileNumber"], {
    message: "Provide exactly one of email or mobileNumber",
  })
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
