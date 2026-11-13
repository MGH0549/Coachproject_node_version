import { Actor, CheckInInput, PageQuery } from '../../domain/models';
import { conflict, fail, missing, ok } from '../../domain/result';
import { Clock, Photos, Store } from '../common/ports';
import { InvalidPhotoError } from '../../domain/errors';
export class ProgressService {
  constructor(
    private readonly db: Store,
    private readonly clock: Clock,
    private readonly photos: Photos,
  ) {}
  async submit(clientId: string, input: CheckInInput) {
    if (
      Object.keys(input.measurements).length > 30 ||
      Object.entries(input.measurements).some(
        ([k, v]) => k.length > 80 || !Number.isFinite(v) || v < 0 || v > 1000,
      )
    )
      return fail('INVALID_MEASUREMENTS', 'القياسات غير صالحة');
    const now = this.clock.now();
    return ok(
      await this.db.checkIn(clientId, input, now, this.clock.localDate(now)),
    );
  }
  async history(clientId: string, query: PageQuery) {
    return ok(await this.db.checkIns(clientId, query));
  }
  async workouts(clientId: string, query: PageQuery) {
    return ok(await this.db.workouts(clientId, query));
  }
  async log(
    clientId: string,
    placementId: string,
    alternativeId: string | null,
  ) {
    const now = this.clock.now();
    const result = await this.db.logWorkout(
      clientId,
      placementId,
      alternativeId,
      now,
      this.clock.localDate(now),
    );
    return result === 'missing'
      ? missing()
      : result === 'locked'
        ? fail('CHOICE_LOCKED', 'الاختيار مقفل بواسطة المدرب', 403)
        : ok(result);
  }
  async feedback(
    actor: Actor,
    clientId: string,
    checkInId: string,
    text: string,
    version: number,
  ) {
    return (await this.db.feedback(actor, clientId, checkInId, text, version))
      ? ok({ message: 'تم حفظ الملاحظات' })
      : conflict();
  }
  async upload(clientId: string, checkInId: string, data: Buffer) {
    if (!(await this.db.ownsCheckIn(clientId, checkInId))) return missing();
    let publicId: string;
    try {
      publicId = await this.photos.upload(clientId, data);
    } catch (error) {
      return error instanceof InvalidPhotoError
        ? fail(
            'INVALID_PHOTO',
            'الصورة غير صالحة. اختر صورة JPEG أو PNG أو WebP',
          )
        : fail(
            'PHOTO_RETRY',
            'تعذر رفع الصورة. تم الاحتفاظ بالقياسات، حاول رفع الصورة لاحقاً',
            503,
          );
    }
    try {
      return ok(await this.db.addPhoto(checkInId, publicId));
    } catch (error) {
      await this.photos.remove(publicId);
      throw error;
    }
  }
  async photo(clientId: string, photoId: string) {
    const photo = await this.db.photo(clientId, photoId);
    if (!photo) return missing();
    return ok({ url: this.photos.url(photo.publicId), expiresIn: 300 });
  }
  async removePhoto(clientId: string, photoId: string) {
    const photo = await this.db.photo(clientId, photoId);
    if (!photo) return missing();
    await this.photos.remove(photo.publicId);
    await this.db.removePhoto(photo.id);
    return ok({ message: 'تم حذف الصورة' });
  }
}
