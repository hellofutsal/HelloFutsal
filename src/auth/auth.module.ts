import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SignupOtpRequest } from "./entities/signup-otp-request.entity";
import { GroundOwnerAccount } from "./entities/ground-owner.entity";
import { UserAccount } from "./entities/user.entity";
import { JwtStrategy } from "./strategies/jwt.strategy";

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    TypeOrmModule.forFeature([
      UserAccount,
      GroundOwnerAccount,
      SignupOtpRequest,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET", "change-this-secret"),
        signOptions: {
          expiresIn: configService.get<string>("JWT_EXPIRES_IN", "1d"),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
