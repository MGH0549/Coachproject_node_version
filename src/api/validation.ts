import { BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';

export interface FieldError {
  field: string;
  messages: string[];
}

export function validationException(errors: ValidationError[]) {
  function fields(items: ValidationError[], parent = ''): FieldError[] {
    return items.flatMap((error) => {
      const field = parent ? `${parent}.${error.property}` : error.property;
      const messages = Object.entries(error.constraints ?? {}).map(
        ([rule, message]) =>
          rule === 'whitelistValidation' ? 'هذا الحقل غير مسموح' : message,
      );
      return [
        ...(messages.length ? [{ field, messages }] : []),
        ...fields(error.children ?? [], field),
      ];
    });
  }
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    message: 'البيانات المدخلة غير صالحة',
    errors: fields(errors),
  });
}
