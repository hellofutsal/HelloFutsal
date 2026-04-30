import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { CreateMembershipPlanDto } from "./dto/create-membership-plan.dto";
import { MembershipPlanService } from "./membership-plan.service";
import { CurrentAccount } from "../auth/decorators/current-account.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedAccount } from "../auth/types/authenticated-account.type";

@Controller("membership-plans")
@UseGuards(JwtAuthGuard)
export class MembershipPlanController {
  constructor(
    private readonly membershipPlanService: MembershipPlanService,
  ) {}


  @Post()
  async createMembershipPlan(
    @Body() dto: CreateMembershipPlanDto,
    @CurrentAccount() currentUser: AuthenticatedAccount,
  ) {
    return await this.membershipPlanService.createMembershipPlan(dto, currentUser);
  }
}
