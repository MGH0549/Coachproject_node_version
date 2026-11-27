import { ClientsService } from '../src/application/clients/clients.service';
import { Clock, Settings, Store } from '../src/application/common/ports';

it('returns client settings fields without exposing internal profile data', async () => {
  const profile = {
    fullName: 'Client',
    email: 'client@example.test',
    whatsapp: '+201234567890',
    status: 'Active',
    package: 'Online',
    accessEndAt: new Date('2027-01-01T21:59:59Z'),
    activatedAt: new Date('2026-11-01T10:00:00Z'),
    createdAt: new Date('2026-10-25T10:00:00Z'),
    deactivatedAt: null,
    reminderSentFor: null,
  };
  const db = { client: async () => profile } as unknown as Store;
  const clock = { now: () => new Date('2026-11-27T10:00:00Z') } as Clock;
  const settings = { whatsapp: '201000000000' } as Settings;
  const result = await new ClientsService(db, clock, settings).clientAccount('client');
  expect(result).toEqual({
    ok: true,
    value: {
      fullName: profile.fullName,
      email: profile.email,
      whatsapp: profile.whatsapp,
      activatedAt: profile.activatedAt,
      createdAt: profile.createdAt,
      status: 'Active',
      accessEndsAt: profile.accessEndAt,
      package: profile.package,
      timeZone: 'Africa/Cairo',
      whatsappUrl: expect.stringContaining('https://wa.me/201000000000'),
    },
  });
});