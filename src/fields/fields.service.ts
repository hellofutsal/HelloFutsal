import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, QueryFailedError, Repository } from "typeorm";
import { AuthenticatedAccount } from "../auth/types/authenticated-account.type";
import { CreateFieldDto } from "./dto/create-field.dto";
import { CreateFieldScheduleSettingsDto } from "./dto/create-field-schedule-settings.dto";
import { CreateFieldSlotDto } from "./dto/create-field-slot.dto";
import { Field } from "./entities/field.entity";
import { FieldScheduleSettings } from "./entities/field-schedule-settings.entity";
import { FieldSlot } from "./entities/field-slot.entity";

@Injectable()
export class FieldsService {
  private readonly logger = new Logger(FieldsService.name);

  constructor(
    @InjectRepository(Field)
    private readonly fieldsRepository: Repository<Field>,
    @InjectRepository(FieldSlot)
    private readonly fieldSlotsRepository: Repository<FieldSlot>,
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

  async createSlots(
    account: AuthenticatedAccount,
    fieldId: string,
    createFieldSlotDtos: CreateFieldSlotDto[],
  ) {
    this.ensureAdmin(account);

    if (createFieldSlotDtos.length === 0) {
      throw new BadRequestException("At least one slot is required");
    }

    const field = await this.fieldsRepository.findOne({
      where: { id: fieldId, ownerId: account.id },
      relations: { scheduleSettings: true },
    });

    if (!field) {
      throw new NotFoundException("Field not found");
    }

    const scheduleSettings = field.scheduleSettings;
    if (!scheduleSettings) {
      throw new BadRequestException(
        "Schedule settings must be created before creating slots",
      );
    }

    const normalizedSlots = createFieldSlotDtos.map((slotDto) =>
      this.normalizeCreateFieldSlotInput(slotDto, scheduleSettings),
    );

    const uniqueSlotKeyCount = new Set(
      normalizedSlots.map(
        (slot) => `${slot.slotDate}::${slot.startTime}::${slot.endTime}`,
      ),
    ).size;

    if (uniqueSlotKeyCount !== normalizedSlots.length) {
      throw new BadRequestException("Slots must not repeat within the request");
    }

    const existingSlots = await this.findExistingSlotsByField(
      fieldId,
      normalizedSlots,
    );

    if (existingSlots.length > 0) {
      throw new ConflictException(
        `One or more slots already exist: ${existingSlots.join(", ")}`,
      );
    }

    const slotEntities = normalizedSlots.map((slot) =>
      this.fieldSlotsRepository.create({
        fieldId,
        slotDate: slot.slotDate,
        startTime: slot.startTime,
        endTime: slot.endTime,
        price: slot.price,
        status: "available",
      }),
    );

    try {
      return await this.fieldSlotsRepository.manager.transaction(
        async (manager) => {
          const repository = manager.getRepository(FieldSlot);
          return repository.save(slotEntities);
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to create slots for fieldId=${fieldId}, count=${slotEntities.length}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException("One or more slots already exist");
      }

      throw error;
    }
  }

  async createScheduleSettings(
    account: AuthenticatedAccount,
    fieldId: string,
    createFieldScheduleSettingsDto: CreateFieldScheduleSettingsDto,
  ) {
    this.ensureAdmin(account);

    const field = await this.fieldsRepository.findOne({
      where: { id: fieldId, ownerId: account.id },
      relations: { scheduleSettings: true },
    });

    if (!field) {
      throw new NotFoundException("Field not found");
    }

    if (field.scheduleSettings) {
      throw new ConflictException(
        "Schedule settings already exist for this field",
      );
    }

    const normalizedSettings = this.normalizeCreateFieldScheduleSettingsInput(
      createFieldScheduleSettingsDto,
    );

    const generatedSlots = this.generateSlotsFromScheduleSettings(
      this.getCurrentDateString(),
      normalizedSettings.openingTime,
      normalizedSettings.closingTime,
      normalizedSettings.slotDurationMin,
      normalizedSettings.breakBetweenMin,
      normalizedSettings.basePrice,
    );

    if (generatedSlots.length === 0) {
      throw new BadRequestException(
        "No slots can be generated with the provided time window",
      );
    }

    return await this.fieldsRepository.manager.transaction(async (manager) => {
      const settingsRepository = manager.getRepository(FieldScheduleSettings);
      const slotsRepository = manager.getRepository(FieldSlot);

      const settings = settingsRepository.create({
        fieldId,
        slotDurationMin: normalizedSettings.slotDurationMin,
        breakBetweenMin: normalizedSettings.breakBetweenMin,
        basePrice: normalizedSettings.basePrice,
      });

      const savedSettings = await settingsRepository.save(settings);

      const slotEntities = generatedSlots.map((slot) =>
        slotsRepository.create({
          fieldId,
          slotDate: slot.slotDate,
          startTime: slot.startTime,
          endTime: slot.endTime,
          price: slot.price,
          status: "available",
        }),
      );

      const savedSlots = await slotsRepository.save(slotEntities);

      return {
        scheduleSettings: savedSettings,
        slots: savedSlots,
      };
    });
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

  private normalizeCreateFieldSlotInput(
    createFieldSlotDto: CreateFieldSlotDto,
    scheduleSettings: FieldScheduleSettings,
  ): {
    slotDate: string;
    startTime: string;
    endTime: string;
    price: string;
  } {
    const startTimeMinutes = this.parseTimeToMinutes(
      createFieldSlotDto.startTime,
    );
    const endTimeMinutes = this.parseTimeToMinutes(createFieldSlotDto.endTime);

    if (endTimeMinutes <= startTimeMinutes) {
      throw new BadRequestException("endTime must be after startTime");
    }

    const durationMinutes = endTimeMinutes - startTimeMinutes;
    if (durationMinutes !== scheduleSettings.slotDurationMin) {
      throw new BadRequestException(
        `Each slot must match the configured slot duration of ${scheduleSettings.slotDurationMin} minutes`,
      );
    }

    return {
      slotDate: createFieldSlotDto.slotDate,
      startTime: createFieldSlotDto.startTime,
      endTime: createFieldSlotDto.endTime,
      price: this.normalizeSlotPrice(
        createFieldSlotDto.price,
        scheduleSettings.basePrice,
      ),
    };
  }

  private normalizeCreateFieldScheduleSettingsInput(
    createFieldScheduleSettingsDto: CreateFieldScheduleSettingsDto,
  ): {
    slotDurationMin: number;
    breakBetweenMin: number;
    basePrice: string;
    openingTime: string;
    closingTime: string;
  } {
    if (!Number.isInteger(createFieldScheduleSettingsDto.slotDurationMin)) {
      throw new BadRequestException("slotDurationMin must be a whole number");
    }

    if (!Number.isInteger(createFieldScheduleSettingsDto.breakBetweenMin)) {
      throw new BadRequestException("breakBetweenMin must be a whole number");
    }

    const openingTime =
      createFieldScheduleSettingsDto.operatingHours?.openingTime;
    const closingTime =
      createFieldScheduleSettingsDto.operatingHours?.closingTime;

    if (!openingTime || !closingTime) {
      throw new BadRequestException(
        "operatingHours.openingTime and operatingHours.closingTime are required",
      );
    }

    const basePrice = Number(createFieldScheduleSettingsDto.basePrice);
    if (Number.isNaN(basePrice) || basePrice < 0) {
      throw new BadRequestException(
        "basePrice must be a valid positive number",
      );
    }

    return {
      slotDurationMin: createFieldScheduleSettingsDto.slotDurationMin,
      breakBetweenMin: createFieldScheduleSettingsDto.breakBetweenMin,
      basePrice: basePrice.toFixed(2),
      openingTime,
      closingTime,
    };
  }

  private getCurrentDateString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  private generateSlotsFromScheduleSettings(
    slotDate: string,
    openingTime: string,
    closingTime: string,
    slotDurationMin: number,
    breakBetweenMin: number,
    basePrice: string,
  ): Array<{
    slotDate: string;
    startTime: string;
    endTime: string;
    price: string;
  }> {
    const slots: Array<{
      slotDate: string;
      startTime: string;
      endTime: string;
      price: string;
    }> = [];

    let currentStart = this.parseTimeToMinutes(openingTime);
    const closingMinutes = this.parseTimeToMinutes(closingTime);

    while (currentStart + slotDurationMin <= closingMinutes) {
      const currentEnd = currentStart + slotDurationMin;
      slots.push({
        slotDate,
        startTime: this.formatMinutesToTime(currentStart),
        endTime: this.formatMinutesToTime(currentEnd),
        price: basePrice,
      });

      currentStart = currentEnd + breakBetweenMin;
    }

    return slots;
  }

  private normalizeSlotPrice(
    price: number | undefined,
    basePrice: string,
  ): string {
    if (price === undefined) {
      return basePrice;
    }

    return price.toFixed(2);
  }

  private parseTimeToMinutes(time: string): number {
    const normalizedTime = time.trim();
    const [hoursText, minutesText] = normalizedTime.split(":");
    const hours = Number(hoursText);
    const minutes = Number(minutesText);

    if (
      Number.isNaN(hours) ||
      Number.isNaN(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      throw new BadRequestException("Invalid time format");
    }

    return hours * 60 + minutes;
  }

  private formatMinutesToTime(totalMinutes: number): string {
    const hours = Math.floor(totalMinutes / 60)
      .toString()
      .padStart(2, "0");
    const minutes = (totalMinutes % 60).toString().padStart(2, "0");

    return `${hours}:${minutes}`;
  }

  private async findExistingSlotsByField(
    fieldId: string,
    slots: Array<{ slotDate: string; startTime: string; endTime: string }>,
  ): Promise<string[]> {
    if (slots.length === 0) {
      return [];
    }

    const existingSlots = await this.fieldSlotsRepository
      .createQueryBuilder("slot")
      .select("slot.slot_date", "slotDate")
      .addSelect("slot.start_time", "startTime")
      .where("slot.field_id = :fieldId", { fieldId })
      .andWhere(
        new Brackets((qb) => {
          slots.forEach((slot, index) => {
            qb.orWhere(
              `(slot.slot_date = :slotDate${index} AND slot.start_time = :startTime${index} AND slot.end_time = :endTime${index})`,
              {
                [`slotDate${index}`]: slot.slotDate,
                [`startTime${index}`]: slot.startTime,
                [`endTime${index}`]: slot.endTime,
              },
            );
          });
        }),
      )
      .getRawMany<{ slotDate: string; startTime: string }>();

    return existingSlots.map((slot) => `${slot.slotDate} ${slot.startTime}`);
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
