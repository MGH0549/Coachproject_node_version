import sharp from 'sharp';
import {
  v2 as cloudinary,
  UploadResponseCallback,
  UploadApiResponse,
} from 'cloudinary';
import { Writable } from 'node:stream';
import { CloudinaryPhotos } from '../src/infrastructure/cloudinary/cloudinary-photos';
import { InvalidPhotoError } from '../src/domain/errors';
describe('private image processing', () => {
  afterEach(() => jest.restoreAllMocks());
  it('rejects non-images and oversized files before external upload', async () => {
    const photos = new CloudinaryPhotos('test', 'test', 'test');
    await expect(
      photos.upload('client', Buffer.from('not an image')),
    ).rejects.toBeInstanceOf(InvalidPhotoError);
    await expect(
      photos.upload('client', Buffer.alloc(8 * 1024 * 1024 + 1)),
    ).rejects.toBeInstanceOf(InvalidPhotoError);
  });
  it('strips metadata, resizes, and uploads an authenticated asset with a random filename', async () => {
    let uploaded = Buffer.alloc(0);
    const upload = jest
      .spyOn(cloudinary.uploader, 'upload_stream')
      .mockImplementation((...args: unknown[]) => {
        const callback = args[1] as UploadResponseCallback;
        const stream = new Writable({
          write(chunk, _encoding, done) {
            uploaded = Buffer.concat([uploaded, chunk]);
            done();
          },
        });
        stream.on('finish', () =>
          callback(undefined, {
            public_id: 'private/photo',
          } as UploadApiResponse),
        );
        return stream as ReturnType<typeof cloudinary.uploader.upload_stream>;
      });
    const source = await sharp({
      create: { width: 2500, height: 2000, channels: 3, background: 'red' },
    })
      .withMetadata({ exif: { IFD0: { Artist: 'Personal name' } } })
      .jpeg()
      .toBuffer();
    const photos = new CloudinaryPhotos('test', 'test', 'test');
    expect(await photos.upload('internal-id', source)).toBe('private/photo');
    const metadata = await sharp(uploaded).metadata();
    expect(metadata.width).toBe(1920);
    expect(metadata.exif).toBeUndefined();
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'authenticated',
        public_id: expect.stringMatching(
          /^progress\/internal-id\/[0-9a-f-]{36}$/,
        ),
        overwrite: false,
      }),
      expect.any(Function),
    );
    const url = new URL(photos.url('private/photo'));
    expect(url.searchParams.get('expires_at')).toBeTruthy();
    expect(url.searchParams.get('signature')).toBeTruthy();
  });
});
