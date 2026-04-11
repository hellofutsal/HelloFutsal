import {
  IsEmail,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from "class-validator";
import { ExactlyOneOf } from "../validators/exactly-one-of.validator";

export class RegisterAdminDto {
  @IsString()
  @MinLength(2)
  ownerName!: string;

  @ExactlyOneOf(["email", "mobileNumber"], {
    message: "Provide exactly one of email or mobileNumber",
  })
  readonly identifier?: string;

  @ValidateIf((value: RegisterAdminDto) => value.email !== undefined)
  @IsEmail()
  email?: string;

  @ValidateIf((value: RegisterAdminDto) => value.mobileNumber !== undefined)
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/)
  mobileNumber?: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
