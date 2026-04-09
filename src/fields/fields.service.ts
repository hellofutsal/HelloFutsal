import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { AuthenticatedAccount } from "../auth/types/authenticated-account.type";
import { CreateFieldDto } from "./dto/create-field.dto";
import { Field } from "./entities/field.entity";

@Injectable()
export class FieldsService {
  private readonly logger = new Logger(FieldsService.name);

  constructor(
    @InjectRepository(Field)
    private readonly fieldsRepository: Repository<Field>,
  ) {}

  async listAvailable() {
    return this.fieldsRepository.find({
      where: { isActive: true },
      order: { createdAt: "DESC" },
    });
  }

  async listMine(account: AuthenticatedAccount) {
    this.ensureAdmin(account);

    return this.fieldsRepository.find({
      where: { ownerId: account.id },
      order: { createdAt: "DESC" },
    });
  }

  async create(account: AuthenticatedAccount, createFieldDto: CreateFieldDto) {
    this.ensureAdmin(account);

    const normalizedField = this.normalizeCreateFieldInput(createFieldDto);
    await this.ensureFieldNameIsAvailable(account.id, normalizedField.name);

    const field = this.fieldsRepository.create({
      ownerId: account.id,
      name: normalizedField.name,
      city: normalizedField.city,
      address: normalizedField.address,
      description: normalizedField.description,
      isActive: true,
    });

    try {
      return await this.fieldsRepository.save(field);
    } catch (error) {
      this.logger.error(
        `Failed to create field for ownerId=${account.id}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          "Field with this name already exists for this owner",
        );
      }

      throw error;
    }
  }

  async createMany(
    account: AuthenticatedAccount,
    createFieldDtos: CreateFieldDto[],
  ) {
    this.ensureAdmin(account);

    if (createFieldDtos.length === 0) {
      throw new BadRequestException("At least one field is required");
    }

    const normalizedFields = createFieldDtos.map((field) =>
      this.normalizeCreateFieldInput(field),
    );

    const normalizedNames = normalizedFields.map((field) =>
      field.name.toLowerCase(),
    );
    const uniqueNameCount = new Set(normalizedNames).size;

    if (uniqueNameCount !== normalizedNames.length) {
      throw new BadRequestException(
        "Field names must be unique within the same request",
      );
    }

    const existingFieldNames = await this.findExistingNamesByOwner(
      account.id,
      normalizedNames,
    );

    if (existingFieldNames.length > 0) {
      throw new ConflictException(
        `One or more field names already exist for this owner: ${existingFieldNames.join(", ")}`,
      );
    }

    const fields = normalizedFields.map((normalizedField) =>
      this.fieldsRepository.create({
        ownerId: account.id,
        name: normalizedField.name,
        city: normalizedField.city,
        address: normalizedField.address,
        description: normalizedField.description,
        isActive: true,
      }),
    );

    try {
      return await this.fieldsRepository.manager.transaction(
        async (manager) => {
          const repository = manager.getRepository(Field);
          return repository.save(fields);
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to bulk create fields for ownerId=${account.id}, count=${fields.length}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          "One or more field names already exist for this owner",
        );
      }

      throw error;
    }
  }

  private normalizeCreateFieldInput(createFieldDto: CreateFieldDto): {
    name: string;
    city?: string;
    address?: string;
    description?: string;
  } {
    const name = createFieldDto.name.trim();
    if (name.length < 2 || name.length > 120) {
      throw new BadRequestException(
        "name must be longer than or equal to 2 characters",
      );
    }

    return {
      name,
      city: this.normalizeOptionalText(createFieldDto.city, 2, 80),
      address: this.normalizeOptionalText(createFieldDto.address, 2, 255),
      description: this.normalizeOptionalText(
        createFieldDto.description,
        2,
        1000,
      ),
    };
  }

  private normalizeOptionalText(
    value: string | undefined,
    minLength: number,
    maxLength: number,
  ): string | undefined {
    if (value === undefined) {
      return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    if (trimmed.length < minLength || trimmed.length > maxLength) {
      throw new BadRequestException(
        `value length must be between ${minLength} and ${maxLength} characters`,
      );
    }

    return trimmed;
  }

  private async ensureFieldNameIsAvailable(
    ownerId: string,
    name: string,
  ): Promise<void> {
    const existingField = await this.fieldsRepository
      .createQueryBuilder("field")
      .select("field.id", "id")
      .where("field.owner_id = :ownerId", { ownerId })
      .andWhere("LOWER(field.name) = LOWER(:name)", { name })
      .getRawOne<{ id: string }>();

    if (existingField) {
      throw new ConflictException(
        "Field with this name already exists for this owner",
      );
    }
  }

  private async findExistingNamesByOwner(
    ownerId: string,
    lowerCaseNames: string[],
  ): Promise<string[]> {
    const existingFields = await this.fieldsRepository
      .createQueryBuilder("field")
      .select("field.name", "name")
      .where("field.owner_id = :ownerId", { ownerId })
      .andWhere("LOWER(field.name) IN (:...names)", { names: lowerCaseNames })
      .getRawMany<{ name: string }>();

    return existingFields.map((field) => field.name);
  }

  private ensureAdmin(account: AuthenticatedAccount): void {
    if (account.role !== "admin") {
      throw new ForbiddenException("Only admins can manage fields");
    }
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
}
