import { photoRetentionEnded } from '../../domain/rules/access';
import { Clock, Mail, Photos, Settings, Store } from './ports';
export class HousekeepingService {
  constructor(
    private readonly db: Store,
    private readonly clock: Clock,
    private readonly mail: Mail,
    private readonly photos: Photos,
    private readonly settings: Settings,
  ) {}
  async run() {
    const now = this.clock.now();
    const due = this.clock.addDays(
      this.clock.localDate(now),
      this.settings.reminderLeadDays,
    );
    for (const client of await this.db.reminderCandidates(due, now)) {
      if (!client.accessEndAt) continue;
      // A rejected delivery must not mark the reminder as sent.
      try {
        await this.mail.reminder(
          client.email,
          client.fullName,
          client.accessEndAt,
        );
        await this.db.markReminder(client.id, client.accessEndAt);
      } catch {
        /* Retry at next daily run. Adapter logs the failure. */
      }
    }
    for (const client of await this.db.cleanupCandidates(now)) {
      // Re-read before deleting to respect reactivation since the candidate query.
      const current = await this.db.client(client.id);
      if (!current || !photoRetentionEnded(current, now)) continue;
      for (const photo of await this.db.clientPhotos(client.id)) {
        await this.photos.remove(photo.publicId);
        await this.db.removePhoto(photo.id);
      }
    }
    await this.db.housekeeping(
      now,
      new Date(now.getTime() - this.settings.auditRetentionDays * 86400000),
    );
  }
}
