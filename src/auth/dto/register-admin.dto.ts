import {
  IsDefined,
  IsEmail,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from "class-validator";

export class RegisterAdminDto {
  @IsString()
  @MinLength(2)
  ownerName!: string;

  @ValidateIf((value: RegisterAdminDto) => !value.email && !value.mobileNumber)
  @IsDefined({ message: "Either email or mobile number is required" })
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
