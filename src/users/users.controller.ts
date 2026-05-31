import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Patch,
  UseGuards,
} from "@nestjs/common";
import { CurrentAccount } from "../auth/decorators/current-account.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedAccount } from "../auth/types/authenticated-account.type";
import { UpdateUserOnboardingDto } from "./dto/update-user-onboarding.dto";
import { UpdateUserProfileDto } from "./dto/update-user-profile.dto";
import { UsersService } from "./users.service";

@UseGuards(JwtAuthGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  getCurrentUser(@CurrentAccount() account: AuthenticatedAccount) {
    this.ensureUser(account);
    return this.usersService.getCurrentUser(account.id);
  }

  @Patch("me")
  updateCurrentUserProfile(
    @CurrentAccount() account: AuthenticatedAccount,
    @Body() updateUserProfileDto: UpdateUserProfileDto,
  ) {
    this.ensureUser(account);
    return this.usersService.updateCurrentUserProfile(
      account.id,
      updateUserProfileDto,
    );
  }

  @Patch("me/onboarding")
  updateCurrentUserOnboarding(
    @CurrentAccount() account: AuthenticatedAccount,
    @Body() updateUserOnboardingDto: UpdateUserOnboardingDto,
  ) {
    this.ensureUser(account);
    return this.usersService.updateCurrentUserOnboarding(
      account.id,
      updateUserOnboardingDto.onboardingNumber,
    );
  }

  private ensureUser(account: AuthenticatedAccount): void {
    if (account.role !== "user") {
      throw new ForbiddenException("Only users can access this route");
    }
  }
}
