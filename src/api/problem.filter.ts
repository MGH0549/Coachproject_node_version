import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Failure, Result } from '../domain/result';
import { FieldError } from './validation';
export function unwrap<R extends Result<unknown>>(
  result: R,
): R extends { ok: true; value: infer T } ? T : never {
  if (!result.ok) throw new HttpException(result.error, result.error.status);
  return result.value as R extends { ok: true; value: infer T } ? T : never;
}
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemFilter.name);
  catch(exception: unknown, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const req = host.switchToHttp().getRequest<FastifyRequest>();
    const nativeStatus =
      typeof exception === 'object' &&
      exception !== null &&
      'statusCode' in exception
        ? Number(exception.statusCode)
        : 500;
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : [400, 413, 415, 429].includes(nativeStatus)
          ? nativeStatus
          : 500;
    const response =
      exception instanceof HttpException ? exception.getResponse() : null;
    const known =
      typeof response === 'object' && response !== null
        ? (response as Partial<Failure> & { errors?: FieldError[] })
        : {};
    const fallback: Record<number, [string, string]> = {
      400: ['VALIDATION_FAILED', 'البيانات المدخلة غير صالحة'],
      401: ['UNAUTHORIZED', 'يرجى تسجيل الدخول'],
      403: ['FORBIDDEN', 'غير مسموح بهذه العملية'],
      404: ['NOT_FOUND', 'السجل غير موجود'],
      413: ['UPLOAD_TOO_LARGE', 'حجم الملف أكبر من المسموح'],
      415: ['UNSUPPORTED_MEDIA', 'نوع الملف غير مدعوم'],
      429: ['RATE_LIMITED', 'طلبات كثيرة. حاول لاحقاً'],
    };
    const [defaultCode, defaultMessage] = fallback[status] ?? [
      'INTERNAL_ERROR',
      'حدث خطأ. حاول مرة أخرى',
    ];
    if (status >= 500)
      this.logger.error({ code: defaultCode, requestId: req.id });
    reply
      .header('Cache-Control', 'no-store')
      .type('application/problem+json')
      .status(status)
      .send({
        type: `urn:coaching:problem:${known.code ?? defaultCode}`,
        status,
        code: known.code ?? defaultCode,
        message:
          typeof known.message === 'string' && known.code
            ? known.message
            : defaultMessage,
        requestId: req.id,
        ...(status === 400 &&
        known.code === 'VALIDATION_FAILED' &&
        Array.isArray(known.errors)
          ? { errors: known.errors }
          : {}),
      });
  }
}
