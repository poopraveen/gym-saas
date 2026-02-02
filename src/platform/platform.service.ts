import { Injectable } from '@nestjs/common';
import { TenantsService, CreateTenantDto } from '../tenants/tenants.service';
import { AuthService } from '../auth/auth.service';
import { Role } from '../common/constants/roles';

@Injectable()
export class PlatformService {
  constructor(
    private tenantsService: TenantsService,
    private authService: AuthService,
  ) {}

  async createTenantWithDefaults(dto: CreateTenantDto) {
    const tenant = await this.tenantsService.create(dto.name, dto.slug, {
      subdomain: dto.subdomain,
      defaultTheme: dto.defaultTheme || 'dark',
      branding: dto.branding as Record<string, unknown> | undefined,
    });
    const tenantDoc = tenant as { _id: unknown };
    const tenantId = String(tenantDoc._id);
    if (dto.customDomain) {
      await this.tenantsService.updateTenant(tenantId, { customDomain: dto.customDomain });
    }
    await this.authService.register(
      dto.adminEmail,
      dto.adminPassword,
      tenantId,
      dto.adminName || 'Admin',
      Role.TENANT_ADMIN,
    );
    const t = tenant as { _id: unknown; toObject?: () => Record<string, unknown> };
    return { tenantId, tenant: t.toObject ? t.toObject() : t };
  }

  async resetTenantAdmin(tenantId: string, email: string, newPassword: string) {
    return this.authService.resetUserPassword(tenantId, email, newPassword);
  }

  /** Get full tenant details + admin user (email, name). Password is not stored in plain text. */
  async getTenantDetails(tenantId: string) {
    const tenant = await this.tenantsService.findById(tenantId);
    if (!tenant) return null;
    const adminUser = await this.authService.getAdminUserByTenantId(tenantId);
    const t = tenant as Record<string, unknown>;
    return {
      ...t,
      adminUser: adminUser ? { email: adminUser.email, name: adminUser.name, role: adminUser.role } : null,
    };
  }
}
