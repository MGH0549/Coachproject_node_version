import { HousekeepingService } from '../src/application/common/housekeeping.service';
import { Clock, Mail, Photos, Store } from '../src/application/common/ports';
import { Client } from '../src/domain/models';
const now = new Date('2026-11-13T07:00:00Z');
const base: Client = {
  id: 'c',
  userId: 'u',
  email: 'client@example.com',
  fullName: 'عميل',
  whatsapp: '201000000000',
  package: 'باقة',
  status: 'Active',
  accessEndAt: new Date('2026-11-16T21:59:59Z'),
  deactivatedAt: null,
  activatedAt: now,
  createdAt: now,
  version: 1,
};
describe('daily retention and reminders', () => {
  it('does not mark failed reminders, and preserves photos after reactivation', async () => {
    const markReminder = jest.fn();
    const clientPhotos = jest.fn();
    const housekeeping = jest.fn();
    const db = {
      reminderCandidates: async () => [base],
      markReminder,
      cleanupCandidates: async () => [
        { ...base, accessEndAt: new Date('2026-11-01T00:00:00Z') },
      ],
      client: async () => base,
      clientPhotos,
      housekeeping,
    } as unknown as Store;
    const mail = {
      reminder: async () => {
        throw new Error('unavailable');
      },
    } as unknown as Mail;
    const clock: Clock = {
      now: () => now,
      localDate: () => '2026-11-13',
      addDays: () => '2026-11-16',
      endOfDay: () => null,
    };
    const job = new HousekeepingService(db, clock, mail, {} as Photos, {
      whatsapp: '201000000000',
      reminderLeadDays: 3,
      auditRetentionDays: 365,
    });
    await job.run();
    expect(markReminder).not.toHaveBeenCalled();
    expect(clientPhotos).not.toHaveBeenCalled();
    expect(housekeeping).toHaveBeenCalled();
  });
  it('records successful reminders and deletes Cloudinary assets before their database records', async () => {
    const calls: string[] = [];
    const ended = { ...base, accessEndAt: new Date('2026-11-01T00:00:00Z') };
    const markReminder = jest.fn();
    const db = {
      reminderCandidates: async () => [base],
      markReminder,
      cleanupCandidates: async () => [ended],
      client: async () => ended,
      clientPhotos: async () => [{ id: 'p', publicId: 'private/p' }],
      removePhoto: async () => {
        calls.push('database');
      },
      housekeeping: async () => {},
    } as unknown as Store;
    const mail = { reminder: async () => {} } as unknown as Mail;
    const photos = {
      remove: async () => {
        calls.push('cloudinary');
      },
    } as unknown as Photos;
    const clock: Clock = {
      now: () => now,
      localDate: () => '2026-11-13',
      addDays: () => '2026-11-16',
      endOfDay: () => null,
    };
    await new HousekeepingService(db, clock, mail, photos, {
      whatsapp: '201000000000',
      reminderLeadDays: 3,
      auditRetentionDays: 365,
    }).run();
    expect(markReminder).toHaveBeenCalledWith(base.id, base.accessEndAt);
    expect(calls).toEqual(['cloudinary', 'database']);
  });
});
