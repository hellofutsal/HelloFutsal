import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";

function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return true;
}

@ValidatorConstraint({ name: "exactlyOneOf", async: false })
export class ExactlyOneOfConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const [fields] = args.constraints as [string[]];
    const object = args.object as Record<string, unknown>;

    return fields.filter((field) => isPresent(object[field])).length === 1;
  }

  defaultMessage(args: ValidationArguments): string {
    const [fields] = args.constraints as [string[]];
    return `Provide exactly one of ${fields.join(" or ")}`;
  }
}

export function ExactlyOneOf(
  fields: string[],
  validationOptions?: ValidationOptions,
) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [fields],
      validator: ExactlyOneOfConstraint,
    });
  };
}
