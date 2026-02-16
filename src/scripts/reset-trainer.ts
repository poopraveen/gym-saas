/**
 * Reset a trainer (or any user) password so you can log in.
 * Run: npx ts-node src/scripts/reset-trainer.ts
 * Uses MONGODB_URI from .env
 */
import * as dns from 'node:dns';
import * as bcrypt from 'bcrypt';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { User } from '../auth/schemas/user.schema';

dns.setServers(['1.1.1.1', '8.8.8.8']);

const EMAIL = process.env.RESET_EMAIL || 'trainer1@trainer.com';
const NEW_PASSWORD = process.env.RESET_PASSWORD || 'trainer1234';

async function resetTrainer() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const userModel = app.get<Model<User>>(getModelToken(User.name));

  const emailRegex = new RegExp(`^${EMAIL.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  const users = await userModel.find({ email: emailRegex }).lean();

  if (users.length === 0) {
    console.error('No user found with email:', EMAIL);
    console.log('Try RESET_EMAIL=your@email.com npx ts-node src/scripts/reset-trainer.ts');
    await app.close();
    process.exit(1);
  }

  if (users.length > 1) {
    console.log('Multiple users with this email (different tenants). Resetting all.');
  }

  const hash = await bcrypt.hash(NEW_PASSWORD, 10);
  for (const u of users) {
    const id = (u as { _id: unknown })._id;
    await userModel.updateOne(
      { _id: id },
      { $set: { passwordHash: hash, isActive: true } },
    );
    console.log('Reset password for:', (u as { email: string }).email, 'tenantId:', (u as { tenantId: string }).tenantId);
  }

  console.log('');
  console.log('Password set to:', NEW_PASSWORD);
  console.log('Login at http://localhost:5173 with:', EMAIL, '/', NEW_PASSWORD);
  await app.close();
}
resetTrainer().catch((e) => {
  console.error(e);
  process.exit(1);
});
