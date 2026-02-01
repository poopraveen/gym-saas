/**
 * Seed script: creates a default tenant and admin user.
 * Run: npx ts-node src/scripts/seed.ts
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

  const tenant = await tenants.create('Reps & Dips', 'reps-and-dips');
  const tenantId = (tenant as any)._id.toString();

  await auth.register(
    'admin@repsanddips.com',
    'Admin123!',
    tenantId,
    'Admin',
    Role.TENANT_ADMIN,
  );

  console.log('Seed done.');
  console.log('Tenant ID:', tenantId);
  console.log('Login: admin@repsanddips.com / Admin123!');
  console.log('Use X-Tenant-ID:', tenantId);
  await app.close();
}
seed().catch(console.error);
