/**
 * Reset admin password to Admin123! (use when login fails).
 * Run: npm run reset-admin
 * Uses MONGODB_URI from .env - use the SAME URI as Render for production.
 */
import * as dns from 'node:dns';
import * as bcrypt from 'bcrypt';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { TenantsService } from '../tenants/tenants.service';
import { AuthService } from '../auth/auth.service';
import { User } from '../auth/schemas/user.schema';
import { Role } from '../common/constants/roles';

dns.setServers(['1.1.1.1', '8.8.8.8']);

const ADMIN_EMAIL = 'admin@repsanddips.com';
const ADMIN_PASSWORD = 'Admin123!';

async function resetAdmin() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const tenants = app.get(TenantsService);
  const auth = app.get(AuthService);
  const userModel = app.get<Model<User>>(getModelToken(User.name));

  const tenant = await tenants.findBySlug('reps-and-dips');
  if (!tenant) {
    console.error('Tenant "Reps & Dips" not found. Run: npm run seed');
    await app.close();
    process.exit(1);
  }

  const tenantId = String((tenant as { _id: unknown })._id);
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const result = await userModel.updateOne(
    { email: ADMIN_EMAIL, tenantId },
    { $set: { passwordHash: hash, isActive: true } },
  );

  if (result.matchedCount === 0) {
    console.log('Admin user not found. Creating...');
    await auth.register(ADMIN_EMAIL, ADMIN_PASSWORD, tenantId, 'Admin', Role.TENANT_ADMIN);
    console.log('Admin user created.');
  } else {
    console.log('Admin password reset to:', ADMIN_PASSWORD);
  }

  console.log('');
  console.log('Tenant ID:', tenantId);
  console.log('Login:', ADMIN_EMAIL, '/', ADMIN_PASSWORD);
  await app.close();
}
resetAdmin().catch((e) => {
  console.error(e);
  process.exit(1);
});
