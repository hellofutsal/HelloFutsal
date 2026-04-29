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
import {
  CreateFieldRuleBookDto,
  RuleBookActionType,
  RuleBookSlotSelectionType,
} from "./dto/create-field-rule-book.dto";
import { CreateFieldScheduleSettingsDto } from "./dto/create-field-schedule-settings.dto";
import { CreateFieldSlotDto } from "./dto/create-field-slot.dto";
import { FieldSlotGenerator } from "./cron/field-slot-generator";
import { FieldSlotSyncService } from "./cron/field-slot-sync.service";
import { FieldRuleBook } from "./entities/field-rule-book.entity";
import { Field } from "./entities/field.entity";
import { FieldScheduleSettings } from "./entities/field-schedule-settings.entity";
import { FieldSlot } from "./entities/field-slot.entity";
import { GroundOwnerAccount } from "../auth/entities/ground-owner.entity";

@Injectable()
export class FieldsService {
  private readonly logger = new Logger(FieldsService.name);
  private readonly initialSlotWindowDays = this.resolveInitialSlotWindowDays();

  constructor(
    @InjectRepository(Field)
    private readonly fieldsRepository: Repository<Field>,
    @InjectRepository(FieldRuleBook)
    private readonly fieldRuleBooksRepository: Repository<FieldRuleBook>,
    @InjectRepository(FieldSlot)
    private readonly fieldSlotsRepository: Repository<FieldSlot>,

    @InjectRepository(FieldScheduleSettings)
    private readonly fieldSettingRepository: Repository<FieldScheduleSettings>,

    @InjectRepository(GroundOwnerAccount)
    private readonly groundOwnerAccountsRepository: Repository<GroundOwnerAccount>,
    private readonly fieldSlotSyncService: FieldSlotSyncService,
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
      return await this.fieldsRepository.manager.transaction(
        async (manager) => {
          const repository = manager.getRepository(Field);
          const groundOwnerRepo = manager.getRepository(GroundOwnerAccount);

          // Only update onboarding if this is the first field
          const existingFieldCount = await repository.count({
            where: { ownerId: account.id },
          });
          if (existingFieldCount === 0) {
            await groundOwnerRepo.update(
              { id: account.id },
              { onboardingNumber: 1, onboardingComplete: false },
            );
          }

          return repository.save(field);
        },
      );
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
    // Move onboarding state update and field creation into the same transaction
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
          const groundOwnerRepo = manager.getRepository(GroundOwnerAccount);

          const existingFieldCount = await repository.count({
            where: { ownerId: account.id },
          });
          if (existingFieldCount === 0) {
            await groundOwnerRepo.update(
              { id: account.id },
              { onboardingNumber: 1, onboardingComplete: false },
            );
          }

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

    // Check if slots already exist in database and implement them immediately if found
    const existingSlots = await this.findExistingSlotsByField(
      fieldId,
      normalizedSlots,
    );

    const existingSlotKeys = new Set(existingSlots);
    const slotsToCreate: Array<{ slotDate: string; startTime: string; endTime: string; price: string }> = [];
    const slotsToImplement: Array<{ slotDate: string; startTime: string; endTime: string; price: string }> = [];

    normalizedSlots.forEach((slot) => {
      const slotKey = `${slot.slotDate} ${slot.startTime}`;
      if (existingSlotKeys.has(slotKey)) {
        slotsToImplement.push({
          slotDate: slot.slotDate,
          startTime: slot.startTime,
          endTime: slot.endTime,
          price: slot.price,
        });
      } else {
        slotsToCreate.push(slot);
      }
    });

    // Implement existing slots immediately (activate them if they were inactive)
    if (slotsToImplement.length > 0) {
      await this.implementExistingSlots(fieldId, slotsToImplement);
      this.logger.log(
        `Implemented ${slotsToImplement.length} existing slots for fieldId=${fieldId}`,
      );
    }

    // Create new slots if any
    if (slotsToCreate.length === 0) {
      return [];
    }

    const slotEntities = slotsToCreate.map((slot) =>
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

  async listSlotsByField(
    fieldId: string,
    dateRange?: { startDate?: string; endDate?: string },
  ) {
    const field = await this.fieldsRepository.findOne({
      where: { id: fieldId, isActive: true },
    });

    if (!field) {
      throw new NotFoundException("Field not found");
    }

    const { startDate, endDate } = dateRange ?? {};
    if ((startDate && !endDate) || (!startDate && endDate)) {
      throw new BadRequestException(
        "startDate and endDate must be provided together",
      );
    }

    if (startDate && endDate && endDate < startDate) {
      throw new BadRequestException("endDate must be on or after startDate");
    }

    const queryBuilder = this.fieldSlotsRepository
      .createQueryBuilder("slot")
      .where("slot.field_id = :fieldId", { fieldId });

    if (startDate && endDate) {
      queryBuilder.andWhere("slot.slot_date BETWEEN :startDate AND :endDate", {
        startDate,
        endDate,
      });
    }

    const slots = await queryBuilder
      .orderBy("slot.slot_date", "ASC")
      .addOrderBy("slot.start_time", "ASC")
      .getMany();

    return slots.map((slot) => ({
      ...slot,
      slotType: slot.status,
    }));
  }

  async getRuleBookById(ruleBookId: string, account: AuthenticatedAccount) {
    // Enforce ownership in the lookup
    const ruleBook = await this.fieldRuleBooksRepository.findOne({
      where: {
        id: ruleBookId,
        field: { ownerId: account.id },
      },
      relations: { field: true },
    });
    if (!ruleBook) {
      throw new NotFoundException("Rule book not found");
    }
    return ruleBook;
  }

  async getScheduleSettingById(
    scheduleSettingId: string,
    account: AuthenticatedAccount,
  ) {
    const scheduleSetting = await this.fieldSettingRepository.findOne({
      where: { id: scheduleSettingId },
    });
    if (!scheduleSetting) {
      throw new NotFoundException("Schedule setting not found");
    }
    // Fetch the field and check ownership
    const field = await this.fieldsRepository.findOne({
      where: { id: scheduleSetting.fieldId },
    });
    if (!field) {
      throw new NotFoundException("Field not found for this schedule setting");
    }
    if (field.ownerId !== account.id) {
      throw new ForbiddenException(
        "You do not have access to this schedule setting",
      );
    }
    return scheduleSetting;
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
      FieldSlotGenerator.getCurrentDateString(),
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

    const savedSettings = await this.fieldsRepository.manager.transaction(
      async (manager) => {
        const settingsRepository = manager.getRepository(FieldScheduleSettings);
        const groundOwnerRepo = manager.getRepository(GroundOwnerAccount);

        const settings = settingsRepository.create({
          fieldId,
          slotDurationMin: normalizedSettings.slotDurationMin,
          breakBetweenMin: normalizedSettings.breakBetweenMin,
          basePrice: normalizedSettings.basePrice,
          openingTime: normalizedSettings.openingTime,
          closingTime: normalizedSettings.closingTime,
        });

        const saved = await settingsRepository.save(settings);

        // Set onboardingNumber = 2 and onboardingComplete = true only after successful save
        await groundOwnerRepo.update(
          { id: account.id },
          { onboardingNumber: 2, onboardingComplete: true },
        );

        return saved;
      },
    );

    await this.fieldSlotSyncService.syncFieldWindow(
      fieldId,
      0,
      this.initialSlotWindowDays,
    );

    const rangeStart = FieldSlotGenerator.getDateStringFromOffset(0);
    const rangeEnd = FieldSlotGenerator.getDateStringFromOffset(
      this.initialSlotWindowDays - 1,
    );

    const syncedSlots = await this.fieldSlotsRepository
      .createQueryBuilder("slot")
      .where("slot.field_id = :fieldId", { fieldId })
      .andWhere("slot.slot_date >= :rangeStart", { rangeStart })
      .andWhere("slot.slot_date <= :rangeEnd", { rangeEnd })
      .orderBy("slot.slot_date", "ASC")
      .addOrderBy("slot.start_time", "ASC")
      .getMany();

    return {
      scheduleSettings: savedSettings,
      slots: syncedSlots,
    };
  }

  async getScheduleSettingByUserId(account: AuthenticatedAccount) {
    this.ensureAdmin(account);

    return await this.fieldSettingRepository
      .createQueryBuilder("setting")
      .leftJoinAndSelect("setting.field", "field")
      .leftJoinAndSelect("field.scheduleSettings", "scheduleSettings") // optional if needed
      .where("field.owner_id = :ownerId", { ownerId: account.id })
      .getMany();
  }

  async getAllScheduleSettingsByAdmin(account: AuthenticatedAccount) {
    this.ensureAdmin(account);

    const [settings, total] = await this.fieldSettingRepository
      .createQueryBuilder("setting")
      .leftJoinAndSelect("setting.field", "field")
      .where("field.owner_id = :ownerId", { ownerId: account.id })
      .orderBy("setting.created_at", "DESC")
      .getManyAndCount();

    return {
      total,
      scheduleSettings: settings.map((s) => ({
        id: s.id,
        fieldId: s.fieldId,
        fieldName: s.field?.fieldName ?? null,
        venueName: s.field?.venueName ?? null,
        slotDurationMin: s.slotDurationMin,
        breakBetweenMin: s.breakBetweenMin,
        basePrice: s.basePrice,
        openingTime: s.openingTime,
        closingTime: s.closingTime,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
    };
  }

  async updateScheduleSettings(
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

    if (!field.scheduleSettings) {
      throw new NotFoundException(
        "Schedule settings do not exist for this field",
      );
    }

    const normalizedSettings = this.normalizeCreateFieldScheduleSettingsInput(
      createFieldScheduleSettingsDto,
    );

    const previewSlots = this.generateSlotsFromScheduleSettings(
      FieldSlotGenerator.getCurrentDateString(),
      normalizedSettings.openingTime,
      normalizedSettings.closingTime,
      normalizedSettings.slotDurationMin,
      normalizedSettings.breakBetweenMin,
      normalizedSettings.basePrice,
    );

    if (previewSlots.length === 0) {
      throw new BadRequestException(
        "No slots can be generated with the provided time window",
      );
    }

    field.scheduleSettings.slotDurationMin = normalizedSettings.slotDurationMin;
    field.scheduleSettings.breakBetweenMin = normalizedSettings.breakBetweenMin;
    field.scheduleSettings.basePrice = normalizedSettings.basePrice;
    field.scheduleSettings.openingTime = normalizedSettings.openingTime;
    field.scheduleSettings.closingTime = normalizedSettings.closingTime;

    const savedSettings = await this.fieldsRepository.manager
      .getRepository(FieldScheduleSettings)
      .save(field.scheduleSettings);

    await this.fieldSlotSyncService.syncFieldWindow(
      fieldId,
      0,
      this.initialSlotWindowDays,
    );

    return {
      scheduleSettings: savedSettings,
      slotsUpdated: true,
      message: "Schedule settings updated. Upcoming slots were synchronized.",
    };
  }

  async createFieldRuleBook(
    account: AuthenticatedAccount,
    fieldId: string,
    createFieldRuleBookDto: CreateFieldRuleBookDto,
  ) {
    this.ensureAdmin(account);

    const field = await this.fieldsRepository.findOne({
      where: { id: fieldId, ownerId: account.id },
      relations: { ruleBooks: true, scheduleSettings: true },
    });

    if (!field) {
      throw new NotFoundException("Field not found");
    }

    if (!field.scheduleSettings) {
      throw new BadRequestException(
        "Schedule settings must be created before creating rule books",
      );
    }

    const normalizedRuleBook = this.normalizeCreateFieldRuleBookInput(
      createFieldRuleBookDto,
      true,
      field.scheduleSettings.slotDurationMin,
    );

    const ruleBook = this.fieldRuleBooksRepository.create({
      fieldId,
      ruleName: normalizedRuleBook.ruleName,
      slotSelectionType: normalizedRuleBook.slotSelectionType,
      actionType: normalizedRuleBook.actionType,
      value: normalizedRuleBook.value,
      ruleConfig: normalizedRuleBook.ruleConfig,
      isActive: normalizedRuleBook.isActive,
    });

    let savedRuleBook: FieldRuleBook;

    try {
      savedRuleBook = await this.fieldRuleBooksRepository.save(ruleBook);
    } catch (error) {
      this.logger.error(
        `Failed to persist rule book for fieldId=${fieldId}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (this.isRuleBookNameUniqueViolation(error)) {
        throw new ConflictException(
          "Rule book name already exists for this field",
        );
      }

      throw error;
    }

    try {
      await this.fieldSlotSyncService.syncFieldWindow(
        fieldId,
        0,
        this.initialSlotWindowDays,
      );

      return {
        ruleBook: savedRuleBook,
        slotsUpdated: true,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create rule book for fieldId=${fieldId}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (this.isFieldSlotUniqueViolation(error)) {
        throw new ConflictException(
          "Slots are being synchronized. Please retry the rule book request.",
        );
      }

      throw error;
    }
  }

  async updateFieldRuleBook(
    account: AuthenticatedAccount,
    fieldId: string,
    ruleBookId: string,
    createFieldRuleBookDto: CreateFieldRuleBookDto,
  ) {
    this.ensureAdmin(account);

    const field = await this.fieldsRepository.findOne({
      where: { id: fieldId, ownerId: account.id },
      relations: { scheduleSettings: true },
    });

    if (!field) {
      throw new NotFoundException("Field not found");
    }

    if (!field.scheduleSettings) {
      throw new BadRequestException(
        "Schedule settings must be created before updating rule books",
      );
    }

    const existingRuleBook = await this.fieldRuleBooksRepository.findOne({
      where: { id: ruleBookId, fieldId },
    });

    if (!existingRuleBook) {
      throw new NotFoundException("Rule book not found");
    }

    const normalizedRuleBook = this.normalizeCreateFieldRuleBookInput(
      createFieldRuleBookDto,
      existingRuleBook.isActive,
      field.scheduleSettings.slotDurationMin,
    );

    existingRuleBook.ruleName = normalizedRuleBook.ruleName;
    existingRuleBook.slotSelectionType = normalizedRuleBook.slotSelectionType;
    existingRuleBook.actionType = normalizedRuleBook.actionType;
    existingRuleBook.value = normalizedRuleBook.value;
    existingRuleBook.ruleConfig = normalizedRuleBook.ruleConfig;
    existingRuleBook.isActive = normalizedRuleBook.isActive;

    let savedRuleBook: FieldRuleBook;

    try {
      savedRuleBook =
        await this.fieldRuleBooksRepository.save(existingRuleBook);
    } catch (error) {
      this.logger.error(
        `Failed to update rule book id=${ruleBookId} for fieldId=${fieldId}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (this.isRuleBookNameUniqueViolation(error)) {
        throw new ConflictException(
          "Rule book name already exists for this field",
        );
      }

      throw error;
    }

    try {
      await this.fieldSlotSyncService.syncFieldWindow(
        fieldId,
        0,
        this.initialSlotWindowDays,
      );

      return {
        ruleBook: savedRuleBook,
        slotsUpdated: true,
      };
    } catch (error) {
      this.logger.error(
        `Failed to sync slots after updating rule book id=${ruleBookId} for fieldId=${fieldId}`,
        error instanceof Error ? error.stack : String(error),
      );

      return {
        ruleBook: savedRuleBook,
        slotsUpdated: false,
        message:
          "Rule book updated successfully, but slot synchronization failed. Please retry slot sync.",
      };
    }
  }
  async getRuleBooksByAdmin(account: AuthenticatedAccount) {
    this.ensureAdmin(account);
    // Get all rule books for all fields owned by this admin
    return this.fieldRuleBooksRepository
      .createQueryBuilder("rule")
      .leftJoinAndSelect("rule.field", "field")
      .where("field.owner_id = :ownerId", { ownerId: account.id })
      .orderBy("rule.created_at", "DESC")
      .getMany();
  }

  async getRuleBooksByUser(account: AuthenticatedAccount) {
    // Return rule books for all fields owned by this user (admin or user)
    return this.fieldRuleBooksRepository
      .createQueryBuilder("rule")
      .leftJoinAndSelect("rule.field", "field")
      .where("field.owner_id = :ownerId", { ownerId: account.id })
      .orderBy("rule.created_at", "DESC")
      .getMany();
  }

  async getRuleBooksByField(fieldId: string) {
    return this.fieldRuleBooksRepository.find({
      where: { fieldId },
      order: { createdAt: "DESC" },
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

  private normalizeCreateFieldRuleBookInput(
    createFieldRuleBookDto: CreateFieldRuleBookDto,
    defaultIsActive = true,
    expectedSlotDurationMin?: number,
  ): {
    ruleName: string;
    slotSelectionType: RuleBookSlotSelectionType;
    actionType: CreateFieldRuleBookDto["actionType"];
    value: string;
    ruleConfig: Record<string, unknown>;
    isActive: boolean;
  } {
    const ruleName = createFieldRuleBookDto.ruleName.trim();
    if (ruleName.length < 2 || ruleName.length > 120) {
      throw new BadRequestException(
        "ruleName must be longer than or equal to 2 characters",
      );
    }

    const value = Number(createFieldRuleBookDto.value);
    if (Number.isNaN(value) || value < 0) {
      throw new BadRequestException("value must be a valid positive number");
    }

    if (
      createFieldRuleBookDto.actionType ===
        RuleBookActionType.PERCENTAGE_DISCOUNT &&
      value > 100
    ) {
      throw new BadRequestException(
        "value must be less than or equal to 100 for percentage discounts",
      );
    }

    const ruleConfig: Record<string, unknown> = {
      actionType: createFieldRuleBookDto.actionType,
      value: value.toFixed(2),
    };

    if (
      createFieldRuleBookDto.slotSelectionType ===
      RuleBookSlotSelectionType.ALL_SLOTS
    ) {
      const activeDays = createFieldRuleBookDto.activeDays;
      if (!activeDays || activeDays.length === 0) {
        throw new BadRequestException(
          "activeDays are required for allSlots rules",
        );
      }

      ruleConfig.allSlots = {
        activeDays,
      };
    }

    if (
      createFieldRuleBookDto.slotSelectionType ===
      RuleBookSlotSelectionType.TIME_RANGE
    ) {
      const timeRange = createFieldRuleBookDto.timeRange;
      if (!timeRange) {
        throw new BadRequestException(
          "timeRange is required for timeRange rules",
        );
      }

      const startTimeMinutes = this.parseTimeToMinutes(timeRange.startTime);
      const endTimeMinutes = this.parseTimeToMinutes(timeRange.endTime);
      const activeDays =
        createFieldRuleBookDto.activeDays ?? timeRange.activeDays;

      if (!activeDays || activeDays.length === 0) {
        throw new BadRequestException(
          "activeDays are required for timeRange rules",
        );
      }

      if (endTimeMinutes <= startTimeMinutes) {
        throw new BadRequestException(
          "timeRange.endTime must be after timeRange.startTime",
        );
      }

      ruleConfig.timeRange = {
        startTime: this.formatMinutesToTime(startTimeMinutes),
        endTime: this.formatMinutesToTime(endTimeMinutes),
        activeDays,
      };
    }

    if (
      createFieldRuleBookDto.slotSelectionType ===
      RuleBookSlotSelectionType.SPECIFIC_SLOTS
    ) {
      const specificSlots = createFieldRuleBookDto.specificSlots;
      if (!specificSlots || specificSlots.length === 0) {
        throw new BadRequestException(
          "specificSlots are required for specificSlots rules",
        );
      }

      ruleConfig.specificSlots = specificSlots.map((slot, index) => {
        const startTimeMinutes = this.parseTimeToMinutes(slot.startTime);
        const endTimeMinutes = this.parseTimeToMinutes(slot.endTime);
        const activeDays = createFieldRuleBookDto.activeDays;

        if (endTimeMinutes <= startTimeMinutes) {
          throw new BadRequestException(
            `specificSlots[${index}].endTime must be after specificSlots[${index}].startTime`,
          );
        }

        const durationMinutes = endTimeMinutes - startTimeMinutes;
        if (
          expectedSlotDurationMin !== undefined &&
          durationMinutes !== expectedSlotDurationMin
        ) {
          throw new BadRequestException(
            `specificSlots[${index}] duration must be ${expectedSlotDurationMin} minutes to match field slot duration`,
          );
        }

        if (!activeDays || activeDays.length === 0) {
          throw new BadRequestException(
            `activeDays are required for specificSlots rules`,
          );
        }

        return {
          activeDays,
          startTime: this.formatMinutesToTime(startTimeMinutes),
          endTime: this.formatMinutesToTime(endTimeMinutes),
        };
      });
    }

    return {
      ruleName,
      slotSelectionType: createFieldRuleBookDto.slotSelectionType,
      actionType: createFieldRuleBookDto.actionType,
      value: value.toFixed(2),
      ruleConfig,
      isActive: createFieldRuleBookDto.isActive ?? defaultIsActive,
    };
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
    return FieldSlotGenerator.generateSlotsFromScheduleSettings(
      slotDate,
      openingTime,
      closingTime,
      slotDurationMin,
      breakBetweenMin,
      basePrice,
    );
  }

  private parseTimeToMinutes(time: string): number {
    return FieldSlotGenerator.parseTimeToMinutes(time);
  }

  private formatMinutesToTime(totalMinutes: number): string {
    return FieldSlotGenerator.formatMinutesToTime(totalMinutes);
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

  private async implementExistingSlots(
    fieldId: string,
    slots: Array<{ slotDate: string; startTime: string; endTime: string; price: string }>,
  ): Promise<void> {
    if (slots.length === 0) {
      return;
    }

    await this.fieldSlotsRepository.manager.transaction(
      async (manager) => {
        const repository = manager.getRepository(FieldSlot);
        
        for (const slot of slots) {
          // First check current slot state
          const existingSlot = await repository.findOne({
            where: {
              fieldId,
              slotDate: slot.slotDate,
              startTime: slot.startTime,
              endTime: slot.endTime,
            },
          });

          if (!existingSlot) {
            continue; // Skip if slot doesn't exist
          }

          // Only change slots that are genuinely inactive (blocked or cancelled)
          if ((existingSlot.status === "blocked" || existingSlot.status === "cancelled") && existingSlot.slotType !== "membership") {
            await repository.update(
              {
                fieldId,
                slotDate: slot.slotDate,
                startTime: slot.startTime,
                endTime: slot.endTime,
              },
              {
                status: "available",
                slotType: "normal",
                price: slot.price,
              },
            );
          } else if (existingSlot.status !== "blocked" && existingSlot.status !== "cancelled") {
            // Throw error when slot is already reserved/booked/membership
            throw new ConflictException(
              `Cannot reopen slot ${slot.slotDate} ${slot.startTime}-${slot.endTime}: slot is already ${existingSlot.status} with type ${existingSlot.slotType}`
            );
          }
        }
      },
    );
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

  private resolveInitialSlotWindowDays(): number {
    const rawValue = process.env.INITIAL_SLOT_WINDOW_DAYS;

    if (!rawValue) {
      return 30;
    }

    const parsedValue = Number(rawValue);
    if (!Number.isInteger(parsedValue) || parsedValue < 1) {
      this.logger.warn(
        `Invalid INITIAL_SLOT_WINDOW_DAYS value "${rawValue}". Falling back to 30.`,
      );
      return 30;
    }

    return parsedValue;
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

  private isRuleBookNameUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = error as QueryFailedError & {
      driverError?: { code?: string; constraint?: string };
    };

    return (
      driverError.driverError?.code === "23505" &&
      driverError.driverError?.constraint ===
        "UQ_field_rule_books_field_rule_name"
    );
  }

  private isFieldSlotUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = error as QueryFailedError & {
      driverError?: { code?: string; constraint?: string };
    };

    return (
      driverError.driverError?.code === "23505" &&
      driverError.driverError?.constraint ===
        "UQ_field_slots_field_date_start_time"
    );
  }
}
