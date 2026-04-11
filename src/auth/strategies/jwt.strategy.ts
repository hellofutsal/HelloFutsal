import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Repository } from "typeorm";
import { GroundOwnerAccount } from "../entities/ground-owner.entity";
import { UserAccount } from "../entities/user.entity";
import { AuthenticatedAccount } from "../types/authenticated-account.type";
import { JwtPayload } from "../types/jwt-payload.type";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectRepository(UserAccount)
    private readonly userAccountsRepository: Repository<UserAccount>,
    @InjectRepository(GroundOwnerAccount)
    private readonly groundOwnerAccountsRepository: Repository<GroundOwnerAccount>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>(
        "JWT_SECRET",
        "change-this-secret",
      ),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedAccount> {
    if (payload.role === "user") {
      const user = await this.userAccountsRepository.findOne({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException("Invalid token");
      }

      return {
        id: user.id,
        username: user.username,
        email: user.email,
        mobileNumber: user.mobileNumber,
        role: "user",
        name: user.name,
      };
    }

    const admin = await this.groundOwnerAccountsRepository.findOne({
      where: { id: payload.sub },
    });

    if (!admin) {
      throw new UnauthorizedException("Invalid token");
    }

    return {
      id: admin.id,
      email: admin.email,
      mobileNumber: admin.mobileNumber,
      role: "admin",
      name: admin.ownerName,
    };
  }
}
