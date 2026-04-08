import {
  IsEmail,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from "class-validator";

export class RegisterUserDto {
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
