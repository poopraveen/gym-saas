/**
 * Import gym_users data into the app's members collection.
 * Uses Cloudflare (1.1.1.1) and Google (8.8.8.8) DNS for SRV resolution.
 */
import * as dns from 'node:dns';
dns.setServers(['1.1.1.1', '8.8.8.8']);

/**
 * Option A - From JSON file (no mongoimport needed):
 *   npx ts-node src/scripts/import-gym-users.ts gym_users.json <tenant-id>
 *
 * Option B - After mongoimport (from MongoDB collection):
 *   npx ts-node src/scripts/import-gym-users.ts --from-db rpesanddips --from-collection gym_users <tenant-id>
 *
 * Get tenant-id from: npm run seed (prints it), or from your tenants collection.
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import mongoose from 'mongoose';
import { AppModule } from '../app.module';
import { MembersService } from '../members/members.service';

function mapRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    'Reg No:': row['Reg No:'] ?? row.regNo,
    NAME: row.NAME ?? row.name,
    Gender: row.Gender ?? row.gender,
    'Date of Joining': row['Date of Joining'] ?? row.dateOfJoining,
    'Phone Number': row['Phone Number'] ?? row.phoneNumber ?? row.phone,
    'Typeof pack': row['Typeof pack'] ?? row.typeofPack ?? row.typeOfPack,
    'DUE DATE': row['DUE DATE'] ?? row.dueDate,
    'Fees Options': row['Fees Options'] ?? row.feesOptions,
    'Fees Amount': row['Fees Amount'] ?? row.feesAmount ?? row['__EMPTY'],
    monthlyAttendance:
      row.monthlyAttendance ?? row['monthlyAttendance'] ?? {
        0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0,
      },
    lastCheckInTime: row.lastCheckInTime ?? row['lastCheckInTime'],
    comments: row.comments ?? row['comments'],
    lastUpdateDateTime: row.lastUpdateDateTime ?? row['lastUpdateDateTime'] ?? new Date().toISOString(),
  };
}

async function importFromFile(filePath: string, tenantId: string, members: MembersService): Promise<number> {
  const fullPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${fullPath}`);
  }
  const raw = fs.readFileSync(fullPath, 'utf-8');
  const data = JSON.parse(raw);
  const rows = Array.isArray(data) ? data : [data];
  let count = 0;
  for (const row of rows) {
    const mapped = mapRow(typeof row === 'object' && row !== null ? row : {});
    const regNo = Number(mapped['Reg No:'] ?? mapped.regNo);
    if (!regNo && regNo !== 0) {
      console.warn('Skipping row with no Reg No:', JSON.stringify(row).slice(0, 80));
      continue;
    }
    await members.upsert(tenantId, mapped, false);
    count++;
  }
  return count;
}

async function importFromMongo(
  sourceDb: string,
  sourceCollection: string,
  tenantId: string,
  members: MembersService,
  appDbUri: string,
): Promise<number> {
  const baseUri = appDbUri.replace(/\/[^/]*$/, '');
  const sourceUri = `${baseUri}/${sourceDb}`;
  const conn = await mongoose.createConnection(sourceUri).asPromise();
  try {
    const db = conn.db;
    if (!db) throw new Error('Database connection not ready');
    const coll = db.collection(sourceCollection);
    const cursor = coll.find({});
    let count = 0;
    for await (const doc of cursor) {
      const row = mapRow(doc as unknown as Record<string, unknown>);
      const regNo = Number(row['Reg No:'] ?? row.regNo ?? (doc as Record<string, unknown>).regNo);
      if (!regNo && regNo !== 0) {
        console.warn('Skipping doc with no Reg No:', (doc as Record<string, unknown>)._id);
        continue;
      }
      await members.upsert(tenantId, row, false);
      count++;
    }
    return count;
  } finally {
    await conn.close();
  }
}

async function run() {
  const args = process.argv.slice(2);
  let filePath: string | null = null;
  let fromDb: string | null = null;
  let fromCollection: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from-db' && args[i + 1]) {
      fromDb = args[++i];
    } else if (args[i] === '--from-collection' && args[i + 1]) {
      fromCollection = args[++i];
    }
  }
  const plainArgs = args.filter((a) => !a.startsWith('--'));
  let tenantId: string | null = null;
  if (fromDb && fromCollection) {
    filePath = null;
    tenantId = plainArgs[plainArgs.length - 1] || null;
  } else if (plainArgs.length >= 2) {
    filePath = plainArgs[0];
    tenantId = plainArgs[1];
  } else if (plainArgs.length === 1 && !fromDb) {
    filePath = plainArgs[0];
  }

  if (!tenantId || tenantId.startsWith('--')) {
    console.error(`
Usage:
  From JSON file:
    npx ts-node src/scripts/import-gym-users.ts gym_users.json <tenant-id>

  From MongoDB (after mongoimport):
    npx ts-node src/scripts/import-gym-users.ts --from-db rpesanddips --from-collection gym_users <tenant-id>

Get tenant-id by running: npm run seed
`);
    process.exit(1);
  }

  if (fromDb && fromCollection) {
    if (!filePath) {
      const app = await NestFactory.createApplicationContext(AppModule);
      const members = app.get(MembersService);
      const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/gym-saas';
      const count = await importFromMongo(fromDb, fromCollection, tenantId, members, uri);
      console.log(`Migrated ${count} members from ${fromDb}.${fromCollection} to tenant ${tenantId}`);
      await app.close();
    } else {
      console.error('Use either --from-db/--from-collection OR a file path, not both.');
      process.exit(1);
    }
  } else if (filePath) {
    const app = await NestFactory.createApplicationContext(AppModule);
    const members = app.get(MembersService);
    const count = await importFromFile(filePath, tenantId, members);
    console.log(`Imported ${count} members from ${filePath} to tenant ${tenantId}`);
    await app.close();
  } else {
    console.error('Provide either a JSON file path or --from-db and --from-collection');
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
