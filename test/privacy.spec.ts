import { PrivacyService } from '../src/application/clients/privacy.service';
import { Photos, Store } from '../src/application/common/ports';
import { ClientExport } from '../src/domain/models';
it('includes authorized expiring photo links in privacy exports even after access ends', async () => {
  const records = {
    photos: [{ id: 'photo', checkInId: 'check' }],
  } as ClientExport;
  const db = {
    client: async () => ({ status: 'Deactivated' }),
    exportClient: async () => records,
    clientPhotos: async () => [{ id: 'photo', publicId: 'private/reference' }],
  } as unknown as Store;
  const photos: Photos = {
    url: () => 'https://example.com/expiring-photo',
    upload: async () => '',
    remove: async () => {},
  };
  const result = await new PrivacyService(db, photos).export(
    { id: 'user', role: 'Client' },
    'client',
  );
  expect(result).toMatchObject({
    ok: true,
    value: {
      photos: [
        {
          id: 'photo',
          url: 'https://example.com/expiring-photo',
          expiresIn: 300,
        },
      ],
    },
  });
  expect(JSON.stringify(result)).not.toContain('private/reference');
});
