import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { CurrentAccount } from "../auth/decorators/current-account.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedAccount } from "../auth/types/authenticated-account.type";
import { CreateMembershipPaymentDto } from "./dto/create-membership-payment.dto";
import { MembershipPaymentService } from "./membership-payment.service";

@Controller("membership-payments")
export class MembershipPaymentController {
  constructor(private readonly svc: MembershipPaymentService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  confirmMonthlyPayment(
    @CurrentAccount() account: AuthenticatedAccount,
    @Body() dto: CreateMembershipPaymentDto,
  ) {
    return this.svc.confirmMonthlyPayment(account, dto);
  }
}
