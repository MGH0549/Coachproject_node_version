export type Failure = { code: string; message: string; status: number };
export type Result<T> = { ok: true; value: T } | { ok: false; error: Failure };
export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = (
  code: string,
  message: string,
  status = 400,
): Result<never> => ({ ok: false, error: { code, message, status } });
export const missing = () => fail('NOT_FOUND', 'السجل غير موجود', 404);
export const conflict = () =>
  fail(
    'VERSION_CONFLICT',
    'تم تعديل السجل. أعد تحميل البيانات وحاول مرة أخرى',
    409,
  );
