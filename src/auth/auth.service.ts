import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { DataSource, QueryFailedError, Repository } from "typeorm";
import { LoginDto } from "./dto/login.dto";
import { RequestAdminSignupOtpDto } from "./dto/request-admin-signup-otp.dto";
import { RequestUserSignupOtpDto } from "./dto/request-user-signup-otp.dto";
import { VerifyAdminSignupOtpDto } from "./dto/verify-admin-signup-otp.dto";
import { VerifyUserSignupOtpDto } from "./dto/verify-user-signup-otp.dto";
import { SignupOtpRequest } from "./entities/signup-otp-request.entity";
import { GroundOwnerAccount } from "./entities/ground-owner.entity";
import { UserAccount } from "./entities/user.entity";
import { AuthenticatedAccount } from "./types/authenticated-account.type";
import { JwtService } from "@nestjs/jwt";

@Injectable()
export class AuthService {
  private readonly otpExpiryMs = 5 * 60 * 1000;

  constructor(
    @InjectRepository(UserAccount)
    private readonly userAccountsRepository: Repository<UserAccount>,
    @InjectRepository(GroundOwnerAccount)
    private readonly groundOwnerAccountsRepository: Repository<GroundOwnerAccount>,
    @InjectRepository(SignupOtpRequest)
    private readonly signupOtpRequestsRepository: Repository<SignupOtpRequest>,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
  ) {}

  async requestUserSignupOtp(requestUserSignupOtpDto: RequestUserSignupOtpDto) {
    const email = requestUserSignupOtpDto.email
      ? this.normalizeEmail(requestUserSignupOtpDto.email)
      : undefined;
    const mobileNumber = requestUserSignupOtpDto.mobileNumber
      ? this.normalizeMobileNumber(requestUserSignupOtpDto.mobileNumber)
      : undefined;

    if (!email && !mobileNumber) {
      throw new BadRequestException(
        "either email or mobile number is required",
      );
    }

    if (email) {
      await this.ensureEmailIsAvailable(email);
    }

    if (mobileNumber) {
      await this.ensureMobileIsAvailable(mobileNumber);
    }

    const username = this.normalizeUsername(requestUserSignupOtpDto.username);
    await this.ensureUsernameIsAvailable(username);

    const identifier = email ?? mobileNumber;
    const identifierType = email ? "email" : "mobile";
    const otp = this.generateOtp();

    await this.signupOtpRequestsRepository.delete({
      identifier,
      accountType: "user",
    });

    const pendingRequest = this.signupOtpRequestsRepository.create({
      identifier,
      identifierType,
      accountType: "user",
      displayName: username,
      passwordHash: await this.hashPassword(requestUserSignupOtpDto.password),
      otpHash: await this.hashPassword(otp),
      rawOtp: this.shouldStoreRawOtp() ? otp : null,
      expiresAt: new Date(Date.now() + this.otpExpiryMs),
      attempts: 0,
    });

    const savedRequest =
      await this.signupOtpRequestsRepository.save(pendingRequest);

    const response: any = {
      requestId: savedRequest.id,
      identifier: savedRequest.identifier,
      identifierType: savedRequest.identifierType,
      expiresAt: savedRequest.expiresAt,
    };

    return response;
  }

  async verifyUserSignupOtp(verifyUserSignupOtpDto: VerifyUserSignupOtpDto) {
    const email = verifyUserSignupOtpDto.email
      ? this.normalizeEmail(verifyUserSignupOtpDto.email)
      : undefined;
    const mobileNumber = verifyUserSignupOtpDto.mobileNumber
      ? this.normalizeMobileNumber(verifyUserSignupOtpDto.mobileNumber)
      : undefined;

    if (!email && !mobileNumber) {
      throw new BadRequestException(
        "Either email or mobile number is required",
      );
    }

    const identifier = email ?? mobileNumber;
    if (!identifier) {
      throw new BadRequestException(
        "Either email or mobile number is required",
      );
    }
    const pendingRequest = await this.signupOtpRequestsRepository.findOne({
      where: { identifier, accountType: "user" },
    });

    if (!pendingRequest) {
      throw new BadRequestException("OTP request not found");
    }

    if (pendingRequest.expiresAt.getTime() < Date.now()) {
      await this.signupOtpRequestsRepository.delete({
        identifier,
        accountType: "user",
      });
      throw new BadRequestException("OTP expired");
    }

    const otpMatches = await bcrypt.compare(
      verifyUserSignupOtpDto.otp,
      pendingRequest.otpHash,
    );

    if (!otpMatches) {
      pendingRequest.attempts += 1;
      await this.signupOtpRequestsRepository.save(pendingRequest);

      if (pendingRequest.attempts >= 5) {
        await this.signupOtpRequestsRepository.delete({
          identifier,
          accountType: "user",
        });
      }

      throw new UnauthorizedException("Invalid OTP");
    }

    let savedUser: UserAccount;
    try {
      savedUser = await this.dataSource.transaction(async (manager) => {
        const userRepository = manager.getRepository(UserAccount);
        const adminRepository = manager.getRepository(GroundOwnerAccount);
        const otpRequestRepository = manager.getRepository(SignupOtpRequest);

        const username = pendingRequest.displayName;
        if (!username) {
          throw new BadRequestException("Username is required");
        }

        const existingByUsername = await userRepository.findOne({
          where: { username },
        });
        if (existingByUsername) {
          throw new ConflictException("Username already exists");
        }

        if (pendingRequest.identifierType === "email") {
          const [existingUser, existingAdmin] = await Promise.all([
            userRepository.findOne({ where: { email: identifier } }),
            adminRepository.findOne({ where: { email: identifier } }),
          ]);

          if (existingUser || existingAdmin) {
            throw new ConflictException("Email already exists");
          }
        } else {
          const existingUser = await userRepository.findOne({
            where: { mobileNumber: identifier },
          });
          if (existingUser) {
            throw new ConflictException("Mobile number already exists");
          }
        }

        const user = userRepository.create({
          username,
          email:
            pendingRequest.identifierType === "email" ? identifier : undefined,
          mobileNumber:
            pendingRequest.identifierType === "mobile" ? identifier : undefined,
          passwordHash: pendingRequest.passwordHash,
        });

        const createdUser = await userRepository.save(user);
        await otpRequestRepository.delete({
          identifier,
          accountType: "user",
        });
        return createdUser;
      });
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException("Account already exists");
      }
      throw error;
    }

    return this.buildAuthResponse({
      id: savedUser.id,
      username: savedUser.username,
      email: savedUser.email,
      mobileNumber: savedUser.mobileNumber,
      role: "user",
      name: savedUser.name,
    });
  }

  async loginUser(loginDto: LoginDto) {
    const email = loginDto.email
      ? this.normalizeEmail(loginDto.email)
      : undefined;
    const mobileNumber = loginDto.mobileNumber
      ? this.normalizeMobileNumber(loginDto.mobileNumber)
      : undefined;
    const username = loginDto.username
      ? this.normalizeUsername(loginDto.username)
      : undefined;

    if (!email && !mobileNumber && !username) {
      throw new BadRequestException(
        "Email, mobile number, or username is required",
      );
    }

    const whereClauses = [];
    if (email) {
      whereClauses.push({ email });
    }
    if (mobileNumber) {
      whereClauses.push({ mobileNumber });
    }
    if (username) {
      whereClauses.push({ username });
    }

    const user = await this.userAccountsRepository.findOne({
      where: whereClauses,
    });

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    await this.assertPasswordMatches(loginDto.password, user.passwordHash);
    return this.buildAuthResponse({
      id: user.id,
      username: user.username,
      email: user.email,
      mobileNumber: user.mobileNumber,
      role: "user",
      name: user.name,
    });
  }

  async requestAdminSignupOtp(
    requestAdminSignupOtpDto: RequestAdminSignupOtpDto,
  ) {
    const ownerName = (
      requestAdminSignupOtpDto.username ?? requestAdminSignupOtpDto.ownerName
    )?.trim();

    if (!ownerName) {
      throw new BadRequestException("Either username or ownerName is required");
    }

    const email = this.normalizeEmail(requestAdminSignupOtpDto.email);
    await this.ensureEmailIsAvailable(email);

    const otp = this.generateOtp();

    await this.signupOtpRequestsRepository.delete({
      identifier: email,
      accountType: "admin",
    });

    const pendingRequest = this.signupOtpRequestsRepository.create({
      identifier: email,
      identifierType: "email",
      accountType: "admin",
      displayName: ownerName,
      passwordHash: await this.hashPassword(requestAdminSignupOtpDto.password),
      otpHash: await this.hashPassword(otp),
      rawOtp: this.shouldStoreRawOtp() ? otp : null,
      expiresAt: new Date(Date.now() + this.otpExpiryMs),
      attempts: 0,
    });

    const savedRequest =
      await this.signupOtpRequestsRepository.save(pendingRequest);

    const response: any = {
      requestId: savedRequest.id,
      email: savedRequest.identifier,
      expiresAt: savedRequest.expiresAt,
    };

    return response;
  }

  async verifyAdminSignupOtp(verifyAdminSignupOtpDto: VerifyAdminSignupOtpDto) {
    const email = this.normalizeEmail(verifyAdminSignupOtpDto.email);
    const pendingRequest = await this.signupOtpRequestsRepository.findOne({
      where: { identifier: email, accountType: "admin" },
    });

    if (!pendingRequest) {
      throw new BadRequestException("OTP request not found");
    }

    if (pendingRequest.expiresAt.getTime() < Date.now()) {
      await this.signupOtpRequestsRepository.delete({
        identifier: email,
        accountType: "admin",
      });
      throw new BadRequestException("OTP expired");
    }

    const otpMatches = await bcrypt.compare(
      verifyAdminSignupOtpDto.otp,
      pendingRequest.otpHash,
    );

    if (!otpMatches) {
      pendingRequest.attempts += 1;
      await this.signupOtpRequestsRepository.save(pendingRequest);

      if (pendingRequest.attempts >= 5) {
        await this.signupOtpRequestsRepository.delete({
          identifier: email,
          accountType: "admin",
        });
      }

      throw new UnauthorizedException("Invalid OTP");
    }

    let savedAdmin: GroundOwnerAccount;
    try {
      savedAdmin = await this.dataSource.transaction(async (manager) => {
        const userRepository = manager.getRepository(UserAccount);
        const adminRepository = manager.getRepository(GroundOwnerAccount);
        const otpRequestRepository = manager.getRepository(SignupOtpRequest);

        const [existingUser, existingAdmin] = await Promise.all([
          userRepository.findOne({ where: { email } }),
          adminRepository.findOne({ where: { email } }),
        ]);

        if (existingUser || existingAdmin) {
          throw new ConflictException("Email already exists");
        }

        const admin = adminRepository.create({
          ownerName: pendingRequest.displayName,
          email,
          passwordHash: pendingRequest.passwordHash,
        });

        const createdAdmin = await adminRepository.save(admin);
        await otpRequestRepository.delete({
          identifier: email,
          accountType: "admin",
        });
        return createdAdmin;
      });
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException("Email already exists");
      }
      throw error;
    }

    return this.buildAuthResponse({
      id: savedAdmin.id,
      email: savedAdmin.email,
      role: "admin",
      name: savedAdmin.ownerName,
      groundName: savedAdmin.groundName,
    });
  }

  async loginAdmin(loginDto: LoginDto) {
    if (!loginDto.email) {
      throw new BadRequestException("Email is required for admin login");
    }

    const admin = await this.groundOwnerAccountsRepository.findOne({
      where: { email: this.normalizeEmail(loginDto.email) },
    });

    if (!admin) {
      throw new UnauthorizedException("Invalid credentials");
    }

    await this.assertPasswordMatches(loginDto.password, admin.passwordHash);
    return this.buildAuthResponse({
      id: admin.id,
      email: admin.email,
      role: "admin",
      name: admin.ownerName,
      groundName: admin.groundName,
    });
  }

  private async ensureEmailIsAvailable(email: string): Promise<void> {
    const [user, admin] = await Promise.all([
      this.userAccountsRepository.findOne({ where: { email } }),
      this.groundOwnerAccountsRepository.findOne({ where: { email } }),
    ]);

    if (user || admin) {
      throw new ConflictException("Email already exists");
    }
  }

  private async ensureMobileIsAvailable(mobileNumber: string): Promise<void> {
    const user = await this.userAccountsRepository.findOne({
      where: { mobileNumber },
    });

    if (user) {
      throw new ConflictException("Mobile number already exists");
    }
  }

  private async ensureUsernameIsAvailable(username: string): Promise<void> {
    const user = await this.userAccountsRepository.findOne({
      where: { username },
    });

    if (user) {
      throw new ConflictException("Username already exists");
    }
  }

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  private generateOtp(): string {
    return randomInt(100000, 1000000).toString();
  }

  private shouldStoreRawOtp(): boolean {
    const configured = process.env.STORE_RAW_OTP;
    if (configured === "true") {
      return true;
    }
    if (configured === "false") {
      return false;
    }

    return process.env.NODE_ENV !== "production";
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = error as QueryFailedError & {
      driverError?: { code?: string };
    };

    return driverError.driverError?.code === "23505";
  }

  private async assertPasswordMatches(
    password: string,
    passwordHash: string,
  ): Promise<void> {
    const matches = await bcrypt.compare(password, passwordHash);
    if (!matches) {
      throw new UnauthorizedException("Invalid credentials");
    }
  }

  private buildAuthResponse(account: AuthenticatedAccount) {
    const accessToken = this.jwtService.sign({
      sub: account.id,
      username: account.username,
      email: account.email,
      mobileNumber: account.mobileNumber,
      role: account.role,
    });

    return {
      accessToken,
      account,
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizeMobileNumber(mobileNumber: string): string {
    return mobileNumber.trim();
  }

  private normalizeUsername(username: string): string {
    return username.trim().toLowerCase();
  }
}
