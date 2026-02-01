/**
 * Migrate members from JSON (file.json / masterData.json) into the new schema.
 * Usage: npx ts-node src/scripts/migrate-json.ts <path-to-file.json> <tenant-id>
 *
 * Example: npx ts-node src/scripts/migrate-json.ts ../gym_server_project-main/masterData.json <TENANT_OBJECT_ID>
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MembersService } from '../members/members.service';

function mapRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    'Reg No:': row['Reg No:'],
    NAME: row['NAME'],
    Gender: row['Gender'],
    'Date of Joining': row['Date of Joining'],
    'Phone Number': row['Phone Number'],
    'Typeof pack': row['Typeof pack'],
    'DUE DATE': row['DUE DATE'],
    'Fees Options': row['Fees Options'],
    'Fees Amount': row['Fees Amount'] ?? row['__EMPTY'],
    monthlyAttendance: row['monthlyAttendance'] || {
      0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0,
    },
    lastCheckInTime: row['lastCheckInTime'],
    comments: row['comments'],
    lastUpdateDateTime: row['lastUpdateDateTime'] || new Date().toISOString(),
  };
}

async function run() {
  const [, , filePath, tenantId] = process.argv;
  if (!filePath || !tenantId) {
    console.error('Usage: npx ts-node migrate-json.ts <path-to-file.json> <tenant-id>');
    process.exit(1);
  }
  const fullPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) {
    console.error('File not found:', fullPath);
    process.exit(1);
  }
  const raw = fs.readFileSync(fullPath, 'utf-8');
  const data = JSON.parse(raw) as Record<string, unknown>[];
  if (!Array.isArray(data)) {
    console.error('JSON must be an array');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule);
  const members = app.get(MembersService);

  let count = 0;
  for (const row of data) {
    const mapped = mapRow(row);
    await members.upsert(tenantId, mapped, false);
    count++;
  }
  console.log(`Migrated ${count} members to tenant ${tenantId}`);
  await app.close();
}
run().catch(console.error);
