import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { CurrentAccount } from "./decorators/current-account.decorator";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { LoginDto } from "./dto/login.dto";
import { RequestAdminSignupOtpDto } from "./dto/request-admin-signup-otp.dto";
import { RequestUserSignupOtpDto } from "./dto/request-user-signup-otp.dto";
import { VerifyAdminSignupOtpDto } from "./dto/verify-admin-signup-otp.dto";
import { VerifyUserSignupOtpDto } from "./dto/verify-user-signup-otp.dto";
import { AuthenticatedAccount } from "./types/authenticated-account.type";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Legacy alias kept for backward compatibility. Prefer POST /auth/users/request-otp.
  @Post("users/register")
  @Post("users/request-otp")
  requestUserSignupOtp(
    @Body() requestUserSignupOtpDto: RequestUserSignupOtpDto,
  ) {
    return this.authService.requestUserSignupOtp(requestUserSignupOtpDto);
  }

  @Post("users/verify-otp")
  verifyUserSignupOtp(@Body() verifyUserSignupOtpDto: VerifyUserSignupOtpDto) {
    return this.authService.verifyUserSignupOtp(verifyUserSignupOtpDto);
  }

  @Post("users/login")
  loginUser(@Body() loginDto: LoginDto) {
    return this.authService.loginUser(loginDto);
  }

  // Legacy alias kept for backward compatibility. Prefer POST /auth/admins/request-otp.
  @Post("admins/request-otp")
  @Post("admins/register")
  requestAdminSignupOtp(
    @Body() requestAdminSignupOtpDto: RequestAdminSignupOtpDto,
  ) {
    return this.authService.requestAdminSignupOtp(requestAdminSignupOtpDto);
  }

  @Post("admins/verify-otp")
  verifyAdminSignupOtp(
    @Body() verifyAdminSignupOtpDto: VerifyAdminSignupOtpDto,
  ) {
    return this.authService.verifyAdminSignupOtp(verifyAdminSignupOtpDto);
  }

  @Post("admins/login")
  loginAdmin(@Body() loginDto: LoginDto) {
    return this.authService.loginAdmin(loginDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  getCurrentAccount(@CurrentAccount() account: AuthenticatedAccount) {
    return { account };
  }
}
