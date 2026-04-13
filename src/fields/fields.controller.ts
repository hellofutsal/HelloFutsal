import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Param,
  ParseArrayPipe,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { ValidationError, validateSync } from "class-validator";
import { CurrentAccount } from "../auth/decorators/current-account.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedAccount } from "../auth/types/authenticated-account.type";
import { CreateFieldDto } from "./dto/create-field.dto";
import { CreateFieldRuleBookDto } from "./dto/create-field-rule-book.dto";
import { CreateFieldScheduleSettingsDto } from "./dto/create-field-schedule-settings.dto";
import { CreateFieldSlotDto } from "./dto/create-field-slot.dto";
import { FieldsService } from "./fields.service";

@Controller("fields")
export class FieldsController {
  constructor(private readonly fieldsService: FieldsService) {}

  @Get()
  listAvailable() {
    return this.fieldsService.listAvailable();
  }

  @UseGuards(JwtAuthGuard)
  @Get("mine")
  listMine(@CurrentAccount() account: AuthenticatedAccount) {
    return this.fieldsService.listMine(account);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @CurrentAccount() account: AuthenticatedAccount,
    @Body() payload: CreateFieldDto | CreateFieldDto[],
  ) {
    if (Array.isArray(payload)) {
      const createFieldDtos = payload.map((item, index) =>
        this.validateDto(item, `fields[${index}]`),
      );
      return this.fieldsService.createMany(account, createFieldDtos);
    }

    const createFieldDto = this.validateDto(payload, "field");
    return this.fieldsService.create(account, createFieldDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post("bulk")
  createBulk(
    @CurrentAccount() account: AuthenticatedAccount,
    @Body(
      new ParseArrayPipe({
        items: CreateFieldDto,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    createFieldDtos: CreateFieldDto[],
  ) {
    return this.fieldsService.createMany(account, createFieldDtos);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":fieldId/slots")
  createSlots(
    @CurrentAccount() account: AuthenticatedAccount,
    @Param("fieldId", new ParseUUIDPipe()) fieldId: string,
    @Body() payload: CreateFieldSlotDto | CreateFieldSlotDto[],
  ) {
    if (Array.isArray(payload)) {
      const slotDtos = payload.map((item, index) =>
        this.validateSlotDto(item, `slots[${index}]`),
      );
      return this.fieldsService.createSlots(account, fieldId, slotDtos);
    }

    const slotDto = this.validateSlotDto(payload, "slot");
    return this.fieldsService.createSlots(account, fieldId, [slotDto]);
  }

  @Get(":fieldId/slots")
  getSlotsByField(@Param("fieldId", new ParseUUIDPipe()) fieldId: string) {
    return this.fieldsService.listSlotsByField(fieldId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":fieldId/schedule-settings")
  createScheduleSettings(
    @CurrentAccount() account: AuthenticatedAccount,
    @Param("fieldId", new ParseUUIDPipe()) fieldId: string,
    @Body() payload: CreateFieldScheduleSettingsDto,
  ) {
    const dto = this.validateScheduleSettingsDto(payload, "scheduleSettings");
    return this.fieldsService.createScheduleSettings(account, fieldId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":fieldId/schedule-settings")
  updateScheduleSettings(
    @CurrentAccount() account: AuthenticatedAccount,
    @Param("fieldId", new ParseUUIDPipe()) fieldId: string,
    @Body() payload: CreateFieldScheduleSettingsDto,
  ) {
    const dto = this.validateScheduleSettingsDto(payload, "scheduleSettings");
    return this.fieldsService.updateScheduleSettings(account, fieldId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":fieldId/rule-books")
  createRuleBook(
    @CurrentAccount() account: AuthenticatedAccount,
    @Param("fieldId", new ParseUUIDPipe()) fieldId: string,
    @Body() payload: CreateFieldRuleBookDto,
  ) {
    const dto = this.validateRuleBookDto(payload, "ruleBook");
    return this.fieldsService.createFieldRuleBook(account, fieldId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":fieldId/rule-books/:ruleBookId")
  updateRuleBook(
    @CurrentAccount() account: AuthenticatedAccount,
    @Param("fieldId", new ParseUUIDPipe()) fieldId: string,
    @Param("ruleBookId", new ParseUUIDPipe()) ruleBookId: string,
    @Body() payload: CreateFieldRuleBookDto,
  ) {
    const dto = this.validateRuleBookDto(payload, "ruleBook");
    return this.fieldsService.updateFieldRuleBook(
      account,
      fieldId,
      ruleBookId,
      dto,
    );
  }

  private validateDto(value: unknown, label: string): CreateFieldDto {
    const dto = plainToInstance(CreateFieldDto, value);
    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      const message = this.collectValidationMessages(errors).join(", ");
      throw new BadRequestException(`${label}: ${message}`);
    }

    return dto;
  }

  private validateSlotDto(value: unknown, label: string): CreateFieldSlotDto {
    const dto = plainToInstance(CreateFieldSlotDto, value);
    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      const message = this.collectValidationMessages(errors).join(", ");
      throw new BadRequestException(`${label}: ${message}`);
    }

    return dto;
  }

  private validateScheduleSettingsDto(
    value: unknown,
    label: string,
  ): CreateFieldScheduleSettingsDto {
    const dto = plainToInstance(CreateFieldScheduleSettingsDto, value);
    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      const message = this.collectValidationMessages(errors).join(", ");
      throw new BadRequestException(`${label}: ${message}`);
    }

    return dto;
  }

  private validateRuleBookDto(
    value: unknown,
    label: string,
  ): CreateFieldRuleBookDto {
    const dto = plainToInstance(CreateFieldRuleBookDto, value);
    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      const message = this.collectValidationMessages(errors).join(", ");
      throw new BadRequestException(`${label}: ${message}`);
    }

    return dto;
  }

  private collectValidationMessages(
    errors: ValidationError[],
    parentPath = "",
  ): string[] {
    const messages: string[] = [];

    for (const error of errors) {
      const propertyPath = parentPath
        ? `${parentPath}.${error.property}`
        : error.property;

      if (error.constraints) {
        for (const message of Object.values(error.constraints)) {
          messages.push(`${propertyPath}: ${message}`);
        }
      }

      if (error.children && error.children.length > 0) {
        messages.push(
          ...this.collectValidationMessages(error.children, propertyPath),
        );
      }
    }

    return messages;
  }
}
