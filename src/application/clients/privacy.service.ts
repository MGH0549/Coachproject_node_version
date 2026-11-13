import { Actor } from '../../domain/models';
import { missing, ok } from '../../domain/result';
import { Photos, Store } from '../common/ports';
export class PrivacyService {
  constructor(
    private readonly db: Store,
    private readonly photos: Photos,
  ) {}
  async export(actor: Actor, clientId: string) {
    if (!(await this.db.client(clientId))) return missing();
    const records = await this.db.exportClient(actor, clientId);
    const assets = new Map(
      (await this.db.clientPhotos(clientId)).map((photo) => [
        photo.id,
        photo.publicId,
      ]),
    );
    return ok({
      ...records,
      photos: records.photos.flatMap((photo) => {
        const publicId = assets.get(photo.id);
        return publicId
          ? [{ ...photo, url: this.photos.url(publicId), expiresIn: 300 }]
          : [];
      }),
    });
  }
  async delete(actor: Actor, clientId: string) {
    if (!(await this.db.client(clientId))) return missing();
    for (const photo of await this.db.clientPhotos(clientId)) {
      await this.photos.remove(photo.publicId);
      await this.db.removePhoto(photo.id);
    }
    await this.db.deleteClient(actor, clientId);
    return ok({ message: 'تم حذف بيانات العميل' });
  }
}
