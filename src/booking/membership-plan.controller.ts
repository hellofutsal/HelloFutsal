import { Body, Controller, Post } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { MembershipPlan } from "./entities/membership-plan.entity";
import { CreateMembershipPlanDto } from "./dto/create-membership-plan.dto";
import { UserAccount } from "../auth/entities/user.entity";
import { Field } from "../fields/entities/field.entity";

@Controller("membership-plans")
export class MembershipPlanController {
  constructor(
    @InjectRepository(MembershipPlan)
    private readonly membershipPlanRepo: Repository<MembershipPlan>,
    @InjectRepository(UserAccount)
    private readonly userRepo: Repository<UserAccount>,
    @InjectRepository(Field)
    private readonly fieldRepo: Repository<Field>,
  ) {}

  @Post()
  async createMembershipPlan(@Body() dto: CreateMembershipPlanDto) {
    const user = await this.userRepo.findOneByOrFail({ id: dto.userId });
    const field = await this.fieldRepo.findOneByOrFail({ id: dto.fieldId });
    const plan = this.membershipPlanRepo.create({
      user,
      field,
      dayOfWeek: dto.dayOfWeek,
      startTime: dto.startTime,
      endTime: dto.endTime,
      active: dto.active,
    });
    await this.membershipPlanRepo.save(plan);
    return { success: true, plan };
  }
}
