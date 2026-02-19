/**
 * Remove duplicate register numbers: per tenant, keep only the latest member
 * for each regNo (by updatedAt), delete the rest.
 *
 * Run: npm run cleanup-duplicate-reg-no
 * Env: TENANT_SLUG (optional) — if set, only that tenant; otherwise all tenants.
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

const TENANT_SLUG = process.env.TENANT_SLUG?.trim(); // optional: run for one tenant only

async function cleanup() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const tenantsService = app.get(TenantsService);
  const memberModel = app.get<Model<Member>>(getModelToken(Member.name));

  let tenantIds: string[];
  if (TENANT_SLUG) {
    const tenant = await tenantsService.findBySlug(TENANT_SLUG);
    if (!tenant) {
      console.error('Tenant with slug "%s" not found.', TENANT_SLUG);
      await app.close();
      process.exit(1);
    }
    tenantIds = [String((tenant as { _id: unknown })._id)];
  } else {
    const all = await tenantsService.findAll();
    tenantIds = (all as Array<{ _id: unknown }>).map((t) => String(t._id));
  }

  let totalDeleted = 0;

  for (const tenantId of tenantIds) {
    const members = await memberModel
      .find({ tenantId })
      .select('_id regNo name updatedAt createdAt')
      .sort({ updatedAt: -1 })
      .lean();

    const byRegNo = new Map<number, Array<{ _id: unknown; regNo: number; name?: string; updatedAt?: Date }>>();
    for (const m of members) {
      const doc = m as Record<string, unknown>;
      const regNo = Number(doc.regNo);
      if (!byRegNo.has(regNo)) byRegNo.set(regNo, []);
      byRegNo.get(regNo)!.push({
        _id: doc._id,
        regNo,
        name: doc.name as string | undefined,
        updatedAt: doc.updatedAt as Date | undefined,
      });
    }

    for (const [regNo, docs] of byRegNo) {
      if (docs.length <= 1) continue;
      // Keep the first (latest by updatedAt), delete the rest
      const toDelete = docs.slice(1);
      const ids = toDelete.map((d) => d._id);
      const result = await memberModel.deleteMany({ _id: { $in: ids } });
      totalDeleted += result.deletedCount;
      console.log(
        `Tenant ${tenantId}: regNo ${regNo} — kept latest, deleted ${result.deletedCount} duplicate(s):`,
        toDelete.map((d) => `${d.name ?? '?'} (_id: ${d._id})`).join(', '),
      );
    }
  }

  console.log('');
  console.log('Total duplicates removed:', totalDeleted);
  await app.close();
}

cleanup().catch((e) => {
  console.error(e);
  process.exit(1);
});
