import { Transform } from "class-transformer";
import { IsObject, IsOptional } from "class-validator";

export class UpdateFieldInventoryDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }

    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }

    return value;
  })
  @IsObject({ message: "inventory must be a key/value object" })
  inventory?: Record<string, unknown>;
}
