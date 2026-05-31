import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserAccount } from "../auth/entities/user.entity";
import { UpdateUserProfileDto } from "./dto/update-user-profile.dto";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserAccount)
    private readonly userAccountsRepository: Repository<UserAccount>,
  ) {}

  async getCurrentUser(userId: string) {
    const user = await this.userAccountsRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return this.buildUserProfile(user);
  }

  async updateCurrentUserProfile(
    userId: string,
    updateUserProfileDto: UpdateUserProfileDto,
  ) {
    const user = await this.userAccountsRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const nextName = updateUserProfileDto.name.trim();
    if (!nextName) {
      throw new BadRequestException("Name is required");
    }

    user.name = nextName;
    const savedUser = await this.userAccountsRepository.save(user);

    return this.buildUserProfile(savedUser);
  }

  async updateCurrentUserOnboarding(userId: string, onboardingNumber: number) {
    const onboardingComplete = onboardingNumber === 2 || onboardingNumber === 3;

    await this.userAccountsRepository.update(
      { id: userId },
      { onboardingNumber, onboardingComplete },
    );

    const updated = await this.userAccountsRepository.findOne({
      where: { id: userId },
    });

    if (!updated) {
      throw new NotFoundException("User not found");
    }

    return this.buildUserProfile(updated);
  }

  private buildUserProfile(user: UserAccount) {
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      mobileNumber: user.mobileNumber,
      onboardingNumber: user.onboardingNumber,
      onboardingComplete: user.onboardingComplete,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
