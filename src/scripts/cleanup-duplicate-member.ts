/**
 * Remove duplicate member records; keep the one with the given Reg No.
 * Example: keep "vicky T" with regNo 029, delete other duplicates.
 *
 * Run: npm run cleanup-duplicate-member
 * Env: TENANT_SLUG (default: reps-and-dips), MEMBER_NAME (e.g. "vicky T"), KEEP_REG_NO (e.g. 29)
 * Uses MONGODB_URI from .env.
 */
import * as dns from 'node:dns';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { TenantsService } from '../tenants/tenants.service';
import { Member } from '../members/schemas/member.schema';

dns.setServers(['1.1.1.1', '8.8.8.8']);

const TENANT_SLUG = process.env.TENANT_SLUG || 'reps-and-dips';
const MEMBER_NAME = (process.env.MEMBER_NAME || 'vicky T').trim();
const KEEP_REG_NO = parseInt(process.env.KEEP_REG_NO || '29', 10);

async function cleanup() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const tenants = app.get(TenantsService);
  const memberModel = app.get<Model<Member>>(getModelToken(Member.name));

  const tenant = await tenants.findBySlug(TENANT_SLUG);
  if (!tenant) {
    console.error('Tenant with slug "%s" not found.', TENANT_SLUG);
    await app.close();
    process.exit(1);
  }

  const tenantId = String((tenant as { _id: unknown })._id);

  // Find all members with matching name (case-insensitive)
  const nameRegex = new RegExp(MEMBER_NAME.replace(/\s+/g, '\\s+'), 'i');
  const candidates = await memberModel
    .find({ tenantId, name: nameRegex })
    .select('_id regNo name')
    .lean();

  if (candidates.length === 0) {
    console.log('No members found with name matching "%s".', MEMBER_NAME);
    await app.close();
    return;
  }

  const toKeep = candidates.find((m) => m.regNo === KEEP_REG_NO);
  const toDelete = candidates.filter((m) => m.regNo !== KEEP_REG_NO);

  if (!toKeep) {
    console.log('No member with regNo %s found. Candidates:', KEEP_REG_NO);
    candidates.forEach((m) => console.log('  regNo:', m.regNo, 'name:', m.name));
    await app.close();
    process.exit(1);
  }

  if (toDelete.length === 0) {
    console.log('Only one record exists (regNo %s). Nothing to delete.', KEEP_REG_NO);
    await app.close();
    return;
  }

  const idsToDelete = toDelete.map((m) => m._id);
  const result = await memberModel.deleteMany({ _id: { $in: idsToDelete } });

  console.log('Kept: regNo %s, name "%s" (_id: %s)', toKeep.regNo, toKeep.name, toKeep._id);
  console.log('Deleted %d duplicate(s):', result.deletedCount);
  toDelete.forEach((m) => console.log('  regNo:', m.regNo, 'name:', m.name, '_id:', m._id));

  await app.close();
}

cleanup().catch((e) => {
  console.error(e);
  process.exit(1);
});
