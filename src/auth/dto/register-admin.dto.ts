import { IsEmail, IsString, MinLength } from "class-validator";

export class RegisterAdminDto {
  @IsString()
  @MinLength(2)
  ownerName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
