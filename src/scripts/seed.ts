/**
 * Seed script: creates a default tenant and admin user (idempotent).
 * Run: npm run seed
 */
import * as dns from 'node:dns';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { TenantsService } from '../tenants/tenants.service';
import { AuthService } from '../auth/auth.service';
import { Role } from '../common/constants/roles';

dns.setServers(['1.1.1.1', '8.8.8.8']);

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const tenants = app.get(TenantsService);
  const auth = app.get(AuthService);

  let tenant: { _id: unknown };
  const existing = await tenants.findBySlug('reps-and-dips');
  if (existing) {
    tenant = existing as { _id: unknown };
    console.log('Tenant "Reps & Dips" already exists.');
    await tenants.ensureSubdomain(String(tenant._id), 'repsanddips');
  } else {
    try {
      tenant = (await tenants.create('Reps & Dips', 'reps-and-dips', {
        subdomain: 'repsanddips',
        defaultTheme: 'dark',
      })) as { _id: unknown };
    } catch (e: unknown) {
      const err = e as { code?: number };
      if (err?.code === 11000) {
        const t = await tenants.findBySlug('reps-and-dips');
        if (!t) throw e;
        tenant = t as { _id: unknown };
        console.log('Tenant "Reps & Dips" already exists.');
      } else {
        throw e;
      }
    }
  }

  const tenantId = String(tenant._id);

  await tenants.updateTenant(tenantId, { subscriptionTier: 'premium' });
  console.log('Tenant set to Premium (medical document upload enabled).');

  try {
    await auth.register(
      'admin@repsanddips.com',
      'Admin123!',
      tenantId,
      'Admin',
      Role.TENANT_ADMIN,
    );
    console.log('Admin user created.');
  } catch (e: unknown) {
    const err = e as { code?: number };
    if (err?.code === 11000) {
      console.log('Admin user already exists.');
    } else {
      throw e;
    }
  }

  try {
    await auth.register(
      'Ranjith@rad.com',
      'password',
      tenantId,
      'Ranjith',
      Role.TENANT_ADMIN,
    );
    console.log('Ranjith user created.');
  } catch (e: unknown) {
    const err = e as { code?: number };
    if (err?.code === 11000) {
      console.log('Ranjith user already exists.');
    } else {
      throw e;
    }
  }

  console.log('');
  console.log('Seed done.');
  console.log('Tenant ID:', tenantId);
  console.log('Login: admin@repsanddips.com / Admin123!');
  console.log('Login: Ranjith@rad.com / password');

  // Platform tenant + super admin (for platform panel)
  let platformTenant: { _id: unknown } | null = await tenants.findBySlug('platform') as { _id: unknown } | null;
  if (!platformTenant) {
    const created = await tenants.create('Platform', 'platform', {
      subdomain: 'platform',
      defaultTheme: 'dark',
    });
    platformTenant = created as { _id: unknown };
    console.log('Platform tenant created.');
  }
  const platformTenantId = String((platformTenant as { _id: unknown })._id);
  try {
    await auth.register(
      'superadmin@platform.com',
      'SuperAdmin123!',
      platformTenantId,
      'Platform Admin',
      Role.SUPER_ADMIN,
    );
    console.log('Super admin created.');
  } catch (e: unknown) {
    const err = e as { code?: number };
    if (err?.code !== 11000) throw e;
  }
  console.log('');
  console.log('Super Admin: superadmin@platform.com / SuperAdmin123!');
  await app.close();
}
seed().catch(console.error);
