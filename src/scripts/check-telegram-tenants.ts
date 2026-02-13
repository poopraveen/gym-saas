/**
 * Check Telegram settings for all tenants (for debugging QR / group link).
 * Run: npm run check:telegram
 * Uses MONGODB_URI from .env
 */
import * as dns from 'node:dns';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { TenantsService } from '../tenants/tenants.service';

dns.setServers(['1.1.1.1', '8.8.8.8']);

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const tenants = app.get(TenantsService);
  const list = await tenants.findAll();
  console.log('\n--- Telegram settings per tenant ---');
  console.log('Uses MONGODB_URI from .env. To match deployed app, set same URI as Render (or your host) and re-run.\n');
  if (list.length === 0) {
    console.log('No tenants found.');
    await app.close();
    return;
  }
  for (const t of list) {
    const row = t as Record<string, unknown>;
    const name = row.name ?? '(no name)';
    const id = row._id;
    const botSet = !!(row.telegramBotToken as string);
    const linkRoot = (row.telegramGroupInviteLink as string)?.trim();
    const settings = row.settings as Record<string, unknown> | undefined;
    const linkSettings = (settings?.telegramGroupInviteLink as string)?.trim();
    const linkEffective = linkRoot || linkSettings;
    console.log(`Tenant: ${name}`);
    console.log(`  _id: ${id}`);
    console.log(`  Bot token: ${botSet ? 'SET' : 'not set'}`);
    console.log(`  Group invite link (root): ${linkRoot ? 'SET' : 'not set'}`);
    if (settings && 'telegramGroupInviteLink' in settings) {
      console.log(`  Group invite link (settings): ${linkSettings ? 'SET' : 'not set'}`);
    }
    console.log(`  → QR will show in gym admin: ${linkEffective ? 'YES' : 'NO'}`);
    console.log('');
  }
  await app.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
