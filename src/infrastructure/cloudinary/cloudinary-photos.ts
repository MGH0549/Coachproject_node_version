import { v2 as cloudinary } from 'cloudinary';
import sharp, { Metadata } from 'sharp';
import { randomUUID } from 'node:crypto';
import { Photos } from '../../application/common/ports';
import { InvalidPhotoError } from '../../domain/errors';
export class CloudinaryPhotos implements Photos {
  constructor(cloudName: string, key: string, secret: string) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: key,
      api_secret: secret,
      secure: true,
    });
  }
  async upload(clientId: string, data: Buffer) {
    if (data.length > 8 * 1024 * 1024 || data.length === 0)
      throw new InvalidPhotoError();
    const image = sharp(data, {
      limitInputPixels: 40000000,
      failOn: 'warning',
      animated: false,
    });
    let metadata: Metadata;
    try {
      metadata = await image.metadata();
    } catch {
      throw new InvalidPhotoError();
    }
    if (
      !['jpeg', 'png', 'webp'].includes(metadata.format ?? '') ||
      (metadata.pages ?? 1) > 1
    )
      throw new InvalidPhotoError();
    // Decoding and re-encoding verifies image content and strips EXIF/location metadata.
    let clean: Buffer;
    try {
      clean = await image
        .rotate()
        .resize({
          width: 1920,
          height: 1920,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch {
      throw new InvalidPhotoError();
    }
    return new Promise<string>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          type: 'authenticated',
          public_id: `progress/${clientId}/${randomUUID()}`,
          overwrite: false,
          format: 'jpg',
        },
        (error, result) => {
          if (error || !result) reject(new Error('PHOTO_UPLOAD_FAILED'));
          else resolve(result.public_id);
        },
      );
      stream.end(clean);
    });
  }
  async remove(publicId: string) {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: 'image',
      type: 'authenticated',
      invalidate: true,
    });
    if (!['ok', 'not found'].includes(result.result))
      throw new Error('PHOTO_DELETE_FAILED');
  }
  url(publicId: string) {
    return cloudinary.utils.private_download_url(publicId, 'jpg', {
      resource_type: 'image',
      type: 'authenticated',
      expires_at: Math.floor(Date.now() / 1000) + 300,
      attachment: false,
    });
  }
}
