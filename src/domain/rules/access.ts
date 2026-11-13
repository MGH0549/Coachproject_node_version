import { ClientAccess } from '../models';
import { fail, ok, Result } from '../result';
export function effectiveStatus(
  client: ClientAccess,
  now = new Date(),
): string {
  return client.status === 'Active' &&
    (!client.accessEndAt || client.accessEndAt <= now)
    ? 'Expired'
    : client.status;
}
export function requireActive(
  client: ClientAccess,
  now = new Date(),
): Result<true> {
  return effectiveStatus(client, now) === 'Active'
    ? ok(true)
    : fail('ACCESS_INACTIVE', 'الاشتراك غير نشط. تواصل مع المدرب', 403);
}
export function validateEnd(
  end: Date,
  now = new Date(),
  previous?: Date | null,
): Result<true> {
  if (!Number.isFinite(end.getTime()) || end <= now)
    return fail('INVALID_END_DATE', 'اختر تاريخ انتهاء في المستقبل');
  if (previous && end <= previous)
    return fail(
      'INVALID_EXTENSION',
      'يجب أن يكون التاريخ الجديد بعد تاريخ الانتهاء الحالي',
    );
  return ok(true);
}
export function selectionAllowed(
  locked: boolean,
  coach: boolean,
): Result<true> {
  return locked && !coach
    ? fail('CHOICE_LOCKED', 'الاختيار مقفل بواسطة المدرب', 403)
    : ok(true);
}
export function photoRetentionEnded(
  client: ClientAccess,
  now = new Date(),
): boolean {
  if (effectiveStatus(client, now) === 'Active') return false;
  const ended =
    client.status === 'Deactivated' ? client.deactivatedAt : client.accessEndAt;
  return !!ended && now.getTime() >= ended.getTime() + 7 * 86400000;
}
