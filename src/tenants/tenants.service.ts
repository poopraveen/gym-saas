import { Injectable, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tenant, TenantBranding, ThemeType } from './schemas/tenant.schema';

export interface CreateTenantDto {
  name: string;
  slug?: string;
  subdomain?: string;
  customDomain?: string;
  adminEmail: string;
  adminPassword: string;
  adminName?: string;
  defaultTheme?: ThemeType;
  branding?: TenantBranding;
  /** Telegram (per-tenant, stored in DB): bot token, owner chat ID, group invite link for QR. */
  telegramBotToken?: string;
  telegramChatId?: string;
  telegramGroupInviteLink?: string;
}

export type SubscriptionTier = 'free' | 'premium';

export interface UpdateTenantDto {
  name?: string;
  subdomain?: string;
  customDomain?: string;
  isActive?: boolean;
  defaultTheme?: ThemeType;
  branding?: Partial<TenantBranding>;
  subscriptionTier?: SubscriptionTier;
  /** Optional settings (e.g. telegramChatId for absence alerts). */
  settings?: Record<string, unknown>;
  /** Telegram: bot token, owner/group chat ID, group invite link (stored in DB, not env). */
  telegramBotToken?: string;
  telegramChatId?: string;
  telegramGroupInviteLink?: string;
}

@Injectable()
export class TenantsService {
  constructor(
    @InjectModel(Tenant.name) private tenantModel: Model<Tenant>,
  ) {}

  async create(
    name: string,
    slug?: string,
    options?: { subdomain?: string; defaultTheme?: string; branding?: Record<string, unknown> },
  ): Promise<Tenant> {
    const s = slug || name.toLowerCase().replace(/\s+/g, '-');
    const subdomain = options?.subdomain ?? s;
    try {
      return await this.tenantModel.create({
        name,
        slug: s,
        subdomain,
        defaultTheme: (options?.defaultTheme as 'light' | 'dark') || 'dark',
        branding: options?.branding,
      });
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 11000) {
        throw new ConflictException('A tenant with this slug or subdomain already exists.');
      }
      throw err;
    }
  }

  /** Public config for login page or app (name, logo, background, theme). Use tenantId when available (after login). Never throws: returns default on DB error. */
  async getPublicConfig(host?: string, tenantId?: string) {
    const defaultConfig = { name: 'Reps & Dips', theme: 'dark' as const, allowsMedicalDocuments: false, medicalDocumentsLimit: 5 };
    try {
      let tenant: Record<string, unknown> | null = null;
      if (tenantId) {
        const byId = await this.findById(tenantId);
        tenant = byId as Record<string, unknown> | null;
      }
      if (!tenant && host && host !== 'localhost' && host !== '127.0.0.1') {
        const byHost = await this.findBySubdomainOrDomain(host);
        tenant = byHost as Record<string, unknown> | null;
      }
      if (!tenant) return defaultConfig;
      const t = tenant as {
        name?: string;
        defaultTheme?: string;
        branding?: { logo?: string; backgroundImage?: string; primaryColor?: string };
        subscriptionTier?: SubscriptionTier;
        settings?: { showFinanceTab?: boolean };
      };
      const tier = t.subscriptionTier ?? 'free';
      const medicalDocumentsLimit = tier === 'premium' ? 30 : 5;
      const showFinanceTab = t.settings?.showFinanceTab !== false;
      return {
        name: t.name || 'Gym',
        theme: t.defaultTheme || 'dark',
        logo: t.branding?.logo,
        backgroundImage: t.branding?.backgroundImage,
        primaryColor: t.branding?.primaryColor,
        allowsMedicalDocuments: tier === 'premium',
        medicalDocumentsLimit,
        showFinanceTab,
      };
    } catch {
      return defaultConfig;
    }
  }

  async findAll() {
    const docs = await this.tenantModel.find().lean();
    return (docs as unknown as Array<Record<string, unknown>>).map((d) => {
      const out: Record<string, unknown> = { ...d };
      if (out._id != null) out._id = String(out._id);
      if (out.createdAt instanceof Date) out.createdAt = out.createdAt.toISOString();
      if (out.updatedAt instanceof Date) out.updatedAt = out.updatedAt.toISOString();
      return out;
    });
  }

  async findById(id: string) {
    return this.tenantModel.findById(id).lean();
  }

  async ensureSubdomain(tenantId: string, subdomain: string) {
    await this.tenantModel.updateOne(
      { _id: tenantId },
      { $set: { subdomain } },
    );
  }

  async updateTenant(tenantId: string, dto: UpdateTenantDto) {
    const update: Record<string, unknown> = {};
    if (dto.name != null) update.name = dto.name;
    if (dto.subdomain != null) update.subdomain = dto.subdomain;
    if (dto.customDomain != null) update.customDomain = dto.customDomain;
    if (dto.isActive != null) update.isActive = dto.isActive;
    if (dto.defaultTheme != null) update.defaultTheme = dto.defaultTheme;
    if (dto.branding != null) update.branding = dto.branding;
    if (dto.subscriptionTier != null) update.subscriptionTier = dto.subscriptionTier;
    if (dto.settings != null) update.settings = dto.settings;
    if (dto.telegramBotToken !== undefined) update.telegramBotToken = dto.telegramBotToken;
    if (dto.telegramChatId !== undefined) update.telegramChatId = dto.telegramChatId;
    if (dto.telegramGroupInviteLink !== undefined) update.telegramGroupInviteLink = dto.telegramGroupInviteLink;
    await this.tenantModel.updateOne({ _id: tenantId }, { $set: update });
    return this.findById(tenantId);
  }

  async findBySlug(slug: string) {
    return this.tenantModel.findOne({ slug }).lean();
  }

  async findBySubdomainOrDomain(host: string) {
    if (!host) return null;
    const normalized = host.replace(/:\d+$/, '').toLowerCase();
    const subdomain = normalized.split('.')[0];
    if (subdomain && subdomain !== 'www') {
      const byCustom = await this.tenantModel.findOne({ customDomain: normalized }).lean();
      if (byCustom) return byCustom;
      const bySubOrSlug = await this.tenantModel
        .findOne({ $or: [{ subdomain }, { slug: subdomain }] })
        .lean();
      if (bySubOrSlug) return bySubOrSlug;
    }
    return this.tenantModel.findOne({ customDomain: normalized }).lean();
  }
}
