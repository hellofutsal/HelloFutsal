import {
  IsEmail,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from "class-validator";
import { ExactlyOneOf } from "../validators/exactly-one-of.validator";

export class RegisterUserDto {
  @ExactlyOneOf(["email", "mobileNumber"], {
    message: "Provide exactly one of email or mobileNumber",
  })
  readonly identifier?: string;

  @ValidateIf((value: RegisterUserDto) => !value.mobileNumber)
  @IsEmail()
  email?: string;

  @ValidateIf((value: RegisterUserDto) => !value.email)
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/)
  mobileNumber?: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
