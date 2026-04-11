import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, QueryFailedError, Repository } from "typeorm";
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
    await this.ensureVenueFieldPairIsAvailable(
      account.id,
      normalizedField.venueName,
      normalizedField.fieldName,
    );

    const field = this.fieldsRepository.create({
      ownerId: account.id,
      venueName: normalizedField.venueName,
      fieldName: normalizedField.fieldName,
      playerCapacity: normalizedField.playerCapacity,
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
        throw new ConflictException("Field name already exists for this venue");
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

    const normalizedVenueFieldPairs = normalizedFields.map(
      (field) =>
        `${field.venueName.toLowerCase()}::${field.fieldName.toLowerCase()}`,
    );
    const uniqueFieldPairCount = new Set(normalizedVenueFieldPairs).size;

    if (uniqueFieldPairCount !== normalizedVenueFieldPairs.length) {
      throw new BadRequestException(
        "Each field name must be unique within its venue in the same request",
      );
    }

    const existingVenueFieldPairs =
      await this.findExistingVenueFieldPairsByOwner(
        account.id,
        normalizedFields.map((field) => ({
          venueName: field.venueName,
          fieldName: field.fieldName,
        })),
      );

    if (existingVenueFieldPairs.length > 0) {
      throw new ConflictException(
        `One or more venue/field pairs already exist: ${existingVenueFieldPairs.join(", ")}`,
      );
    }

    const fields = normalizedFields.map((normalizedField) =>
      this.fieldsRepository.create({
        ownerId: account.id,
        venueName: normalizedField.venueName,
        fieldName: normalizedField.fieldName,
        playerCapacity: normalizedField.playerCapacity,
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
          "One or more venue/field pairs already exist",
        );
      }

      throw error;
    }
  }

  private normalizeCreateFieldInput(createFieldDto: CreateFieldDto): {
    venueName: string;
    fieldName: string;
    playerCapacity: number;
    city?: string;
    address?: string;
    description?: string;
  } {
    const venueName = createFieldDto.venueName.trim();
    if (venueName.length < 2 || venueName.length > 120) {
      throw new BadRequestException(
        "venueName must be longer than or equal to 2 characters",
      );
    }

    const fieldName = createFieldDto.fieldName.trim();
    if (fieldName.length < 2 || fieldName.length > 100) {
      throw new BadRequestException(
        "fieldName must be longer than or equal to 2 characters",
      );
    }

    if (
      !Number.isInteger(createFieldDto.playerCapacity) ||
      createFieldDto.playerCapacity < 1
    ) {
      throw new BadRequestException(
        "playerCapacity must be a positive integer",
      );
    }

    return {
      venueName,
      fieldName,
      playerCapacity: createFieldDto.playerCapacity,
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

  private async ensureVenueFieldPairIsAvailable(
    ownerId: string,
    venueName: string,
    fieldName: string,
  ): Promise<void> {
    const existingField = await this.fieldsRepository
      .createQueryBuilder("field")
      .select("field.id", "id")
      .where("field.owner_id = :ownerId", { ownerId })
      .andWhere("LOWER(field.venue_name) = LOWER(:venueName)", { venueName })
      .andWhere("LOWER(field.field_name) = LOWER(:fieldName)", { fieldName })
      .getRawOne<{ id: string }>();

    if (existingField) {
      throw new ConflictException("Field name already exists for this venue");
    }
  }

  private async findExistingVenueFieldPairsByOwner(
    ownerId: string,
    venueFieldPairs: { venueName: string; fieldName: string }[],
  ): Promise<string[]> {
    if (venueFieldPairs.length === 0) {
      return [];
    }

    const existingFields = await this.fieldsRepository
      .createQueryBuilder("field")
      .select("field.venue_name", "venueName")
      .addSelect("field.field_name", "fieldName")
      .where("field.owner_id = :ownerId", { ownerId })
      .andWhere(
        new Brackets((qb) => {
          venueFieldPairs.forEach((pair, index) => {
            qb.orWhere(
              `(LOWER(field.venue_name) = LOWER(:venueName${index}) AND LOWER(field.field_name) = LOWER(:fieldName${index}))`,
              {
                [`venueName${index}`]: pair.venueName,
                [`fieldName${index}`]: pair.fieldName,
              },
            );
          });
        }),
      )
      .getRawMany<{ venueName: string; fieldName: string }>();

    return existingFields.map(
      (field) => `${field.venueName} - ${field.fieldName}`,
    );
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
