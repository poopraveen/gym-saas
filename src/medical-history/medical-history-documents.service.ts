import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Readable } from 'stream';
import * as path from 'path';
import * as sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';
import { MedicalHistoryDocument } from './schemas/medical-history-document.schema';
import { TenantsService, SubscriptionTier } from '../tenants/tenants.service';

/** Ensure .env is loaded from project root (same folder as package.json) if not already in process.env. */
function ensureEnvLoaded(): void {
  if (process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
  } catch {
    // dotenv or .env missing; continue
  }
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_DOCUMENTS_FREE = 5;
const MAX_DOCUMENTS_PREMIUM = 30;

const ALLOWED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
];

/** Max longest side in px; images are resized to fit before upload. */
const MAX_IMAGE_DIMENSION = 1920;
/** WebP quality (0–100) for compressed images. */
const COMPRESS_QUALITY = 80;

/**
 * Configure Cloudinary. Prefer explicit env vars (App Key = api_key, API Secret = api_secret).
 * Format: CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
 * i.e. App Key before the colon, API Secret after.
 */
function configureCloudinary(config: ConfigService): void {
  const cloudName = config.get<string>('CLOUDINARY_CLOUD_NAME') || process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = config.get<string>('CLOUDINARY_API_KEY') || process.env.CLOUDINARY_API_KEY;
  const apiSecret = config.get<string>('CLOUDINARY_API_SECRET') || process.env.CLOUDINARY_API_SECRET;
  if (cloudName && apiKey && apiSecret) {
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
    return;
  }
  const url = config.get<string>('CLOUDINARY_URL') || process.env.CLOUDINARY_URL;
  if (url && typeof url === 'string' && url.startsWith('cloudinary://')) {
    try {
      const rest = url.replace('cloudinary://', '');
      const at = rest.indexOf('@');
      if (at === -1) return;
      const keySecret = rest.slice(0, at);
      const parsedCloudName = rest.slice(at + 1).split('/')[0];
      const colon = keySecret.indexOf(':');
      if (colon === -1) return;
      const parsedApiKey = keySecret.slice(0, colon);
      const parsedApiSecret = keySecret.slice(colon + 1);
      cloudinary.config({
        cloud_name: parsedCloudName,
        api_key: parsedApiKey,
        api_secret: parsedApiSecret,
      });
    } catch {
      // ignore
    }
  }
}

@Injectable()
export class MedicalHistoryDocumentsService {
  constructor(
    @InjectModel(MedicalHistoryDocument.name)
    private docModel: Model<MedicalHistoryDocument>,
    private configService: ConfigService,
    private tenantsService: TenantsService,
  ) {
    configureCloudinary(configService);
  }

  private async getTenantTier(tenantId: string): Promise<SubscriptionTier> {
    const tenant = await this.tenantsService.findById(tenantId);
    const t = tenant as { subscriptionTier?: SubscriptionTier } | null;
    return t?.subscriptionTier ?? 'free';
  }

  /**
   * Compress image buffer: resize to max dimension and encode as WebP for smaller size.
   * Non-image files (e.g. PDF) are returned unchanged.
   */
  private async compressImageIfNeeded(
    buffer: Buffer,
    mimetype: string,
  ): Promise<{ buffer: Buffer; mimetype: string }> {
    const imageMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!imageMimes.includes(mimetype)) {
      return { buffer, mimetype };
    }
    try {
      const meta = await sharp(buffer).metadata();
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      const needsResize = w > MAX_IMAGE_DIMENSION || h > MAX_IMAGE_DIMENSION;
      let pipeline = sharp(buffer);
      if (needsResize) {
        pipeline = pipeline.resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }
      const out = await pipeline.webp({ quality: COMPRESS_QUALITY }).toBuffer();
      return { buffer: out, mimetype: 'image/webp' };
    } catch {
      return { buffer, mimetype };
    }
  }

  async upload(
    tenantId: string,
    userId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    label?: string,
  ): Promise<{ _id: string; originalName: string; label?: string; mimeType: string; size: number; url: string; uploadedAt: string }> {
    const tier = await this.getTenantTier(tenantId);
    const currentCount = await this.docModel.countDocuments({ tenantId, userId });
    const limit = tier === 'premium' ? MAX_DOCUMENTS_PREMIUM : MAX_DOCUMENTS_FREE;
    if (currentCount >= limit) {
      if (tier !== 'premium') {
        throw new ForbiddenException(
          'You have reached the limit of 5 medical records. Subscribe to Premium to upload more.',
        );
      }
      throw new ForbiddenException(
        `Maximum ${MAX_DOCUMENTS_PREMIUM} medical records allowed. Delete an existing record to upload a new one.`,
      );
    }
    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('No file provided.');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(`File size must not exceed ${MAX_FILE_SIZE / 1024 / 1024} MB.`);
    }
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      throw new BadRequestException('Allowed types: images (JPEG, PNG, GIF, WebP) and PDF.');
    }
    ensureEnvLoaded();
    configureCloudinary(this.configService);
    const hasUrl = !!(this.configService.get('CLOUDINARY_URL') || process.env.CLOUDINARY_URL);
    const hasSeparate = !!(this.configService.get('CLOUDINARY_CLOUD_NAME') || process.env.CLOUDINARY_CLOUD_NAME);
    const cloudConfigured = !!cloudinary.config().cloud_name;
    const envPath = path.resolve(process.cwd(), '.env');
    if (!cloudConfigured && !hasUrl && !hasSeparate) {
      throw new BadRequestException(
        `File storage is not configured. Add CLOUDINARY_URL to the .env file. Expected file location: ${envPath} (run the server from the project root, same folder as package.json). Example line: CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME Then restart the server.`,
      );
    }
    if (!cloudConfigured) {
      throw new BadRequestException(
        `File storage is not configured. CLOUDINARY_URL is set but invalid or Cloudinary could not be configured. Check the value in ${envPath} — it must be exactly: cloudinary://API_KEY:API_SECRET@CLOUD_NAME (no quotes, no spaces). Then restart the server.`,
      );
    }

    let buffer = file.buffer;
    let mimetype = file.mimetype;
    let size = file.size;

    const compressed = await this.compressImageIfNeeded(buffer, mimetype);
    buffer = compressed.buffer;
    mimetype = compressed.mimetype;
    size = buffer.length;

    const folder = `medical-history/${tenantId}/${userId}`;
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'auto',
          allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'],
        },
        (err, result) => {
          if (err) {
            return reject(new BadRequestException(err.message || 'Upload failed'));
          }
          if (!result || !result.secure_url) {
            return reject(new BadRequestException('Upload failed'));
          }
          const displayLabel = (label || '').trim() || undefined;
          this.docModel
            .create({
              tenantId,
              userId,
              publicId: result.public_id,
              resourceType: (result as any).resource_type || 'image',
              originalName: file.originalname,
              label: displayLabel,
              mimeType: mimetype,
              size,
              url: result.secure_url,
            })
            .then((doc) => {
              resolve({
                _id: String(doc._id),
                originalName: doc.originalName,
                label: (doc as any).label,
                mimeType: doc.mimeType || mimetype,
                size: doc.size ?? size,
                url: doc.url,
                uploadedAt: (doc.uploadedAt || new Date()).toISOString(),
              });
            })
            .catch(reject);
        },
      );
      Readable.from(buffer).pipe(uploadStream);
    });
  }

  /**
   * List documents for the given user only. Secured: tenantId and userId come from JWT.
   * Does not return url – use getOne() when user clicks View so access is checked per document.
   */
  async listForUser(tenantId: string, userId: string): Promise<Array<{ _id: string; originalName: string; label?: string; mimeType?: string; size?: number; uploadedAt: string }>> {
    const docs = await this.docModel
      .find({ tenantId, userId })
      .select('-url -publicId')
      .sort({ uploadedAt: -1 })
      .lean();
    return docs.map((d) => ({
      _id: String((d as any)._id),
      originalName: (d as any).originalName,
      label: (d as any).label,
      mimeType: (d as any).mimeType,
      size: (d as any).size,
      uploadedAt: ((d as any).uploadedAt || (d as any).createdAt)?.toISOString?.() || new Date().toISOString(),
    }));
  }

  /**
   * Get a single document only if it belongs to the given user. Secured: tenantId and userId from JWT.
   * Returns url only after ownership is verified – no user can view another user's document.
   */
  async getOne(tenantId: string, userId: string, documentId: string): Promise<{ url: string; originalName: string; label?: string; mimeType?: string } | null> {
    const doc = await this.docModel
      .findOne({ _id: documentId, tenantId, userId })
      .select('url originalName label mimeType')
      .lean();
    if (!doc) return null;
    const d = doc as any;
    return { url: d.url, originalName: d.originalName, label: d.label, mimeType: d.mimeType };
  }

  async deleteOne(tenantId: string, userId: string, documentId: string): Promise<boolean> {
    const doc = await this.docModel.findOne({ _id: documentId, tenantId, userId }).lean();
    if (!doc) return false;
    const d = doc as any;
    const resourceType = d.resourceType || 'image';
    try {
      await cloudinary.uploader.destroy(d.publicId, { resource_type: resourceType });
    } catch {
      if (resourceType !== 'raw') {
        try {
          await cloudinary.uploader.destroy(d.publicId, { resource_type: 'raw' });
        } catch {
          // ignore
        }
      }
    }
    await this.docModel.deleteOne({ _id: documentId, tenantId, userId });
    return true;
  }
}
