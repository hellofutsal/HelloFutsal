import {
  BadRequestException,
  Body,
  Controller,
  Get,
  ParseArrayPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { CurrentAccount } from "../auth/decorators/current-account.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedAccount } from "../auth/types/authenticated-account.type";
import { CreateFieldDto } from "./dto/create-field.dto";
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

  private validateDto(value: unknown, label: string): CreateFieldDto {
    const dto = plainToInstance(CreateFieldDto, value);
    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      const message = errors
        .flatMap((error) => Object.values(error.constraints ?? {}))
        .join(", ");
      throw new BadRequestException(`${label}: ${message}`);
    }

    return dto;
  }
}
