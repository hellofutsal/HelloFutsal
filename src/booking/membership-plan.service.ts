import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AuthenticatedAccount } from "../auth/types/authenticated-account.type";
import { MembershipPlan } from "./entities/membership-plan.entity";

@Injectable()
export class MembershipPlanService {
  constructor(
    @InjectRepository(MembershipPlan)
    private readonly membershipPlanRepo: Repository<MembershipPlan>,
  ) {}

  async findMembershipPlanById(
    planId: string,
    currentUser: AuthenticatedAccount,
  ) {
    const plan = await this.membershipPlanRepo.findOne({
      where: { id: planId },
      relations: ["field", "user"],
    });

    if (!plan || !plan.field || !plan.user) {
      throw new NotFoundException("Membership plan not found");
    }

    const isFieldOwner = currentUser.id === plan.field.ownerId;
    const isMembershipHolder = currentUser.id === plan.user.id;
    const isAdmin = currentUser.role === "admin";

    if (!isAdmin && !isFieldOwner && !isMembershipHolder) {
      throw new ForbiddenException("Not authorized to view this membership");
    }

    return plan;
  }
}
