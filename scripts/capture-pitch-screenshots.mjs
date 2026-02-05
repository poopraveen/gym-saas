#!/usr/bin/env node
/**
 * Capture app screenshots for the pitch PDF using Playwright.
 * Run with the app and API running (e.g. frontend on 5173, backend on 3000).
 *
 * Env vars:
 *   BASE_URL          - App URL (default http://localhost:5173)
 *   TENANT_ID         - Tenant ID for login (required for tenant admin flow)
 *   ADMIN_EMAIL       - Tenant admin email
 *   ADMIN_PASSWORD    - Tenant admin password
 *   SUPER_ADMIN_EMAIL - Optional: for Platform Admin screenshot
 *   SUPER_ADMIN_PASSWORD
 *
 * Usage:
 *   TENANT_ID=xxx ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=secret node scripts/capture-pitch-screenshots.mjs
 *   Or on Windows: set TENANT_ID=xxx && set ADMIN_EMAIL=... && node scripts/capture-pitch-screenshots.mjs
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const TENANT_ID = process.env.TENANT_ID;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

const OUT_DIR = join(__dirname, '..', 'src', 'platform', 'assets', 'pitch-screenshots');
const VIEWPORT = { width: 1280, height: 900 };
const NETWORK_IDLE_TIMEOUT = 20000;
const LOADER_GONE_TIMEOUT = 30000;
const LOADER_APPEAR_TIMEOUT = 8000;
const STABLE_DELAY_MS = 800;

/**
 * Wait until the global API loader is done. The loader appears after React mounts and
 * API calls start; we must wait for it to appear (or timeout) and then disappear,
 * so we don't capture during the brief moment before any loader is in the DOM.
 */
async function waitForLoaderDone(page) {
  // 1. Wait for loader to appear (app has mounted and started API calls). If it doesn't appear in time, skip.
  await page.waitForSelector('.global-loader-overlay', { state: 'visible', timeout: LOADER_APPEAR_TIMEOUT }).catch(() => {});
  // 2. Wait for loader to be gone (not in DOM). If it never appeared, this may timeout - then force wait.
  try {
    await page.waitForSelector('.global-loader-overlay', { state: 'detached', timeout: LOADER_GONE_TIMEOUT });
  } catch {
    // Loader might never have appeared; ensure it's not there now
    await page.waitForFunction(
      () => !document.querySelector('.global-loader-overlay'),
      { timeout: 2000 }
    ).catch(() => {});
  }
  // 3. Extra delay so UI is stable and no flicker
  await page.waitForTimeout(STABLE_DELAY_MS);
}

/** Wait for page-specific content to be ready (no loading state), then take screenshot. */
async function gotoAndCapture(page, url, outputFile, options = {}) {
  const { waitForSelector = null, waitForDetached = null, extraDelay = 400 } = options;
  await page.goto(url, { waitUntil: 'networkidle', timeout: NETWORK_IDLE_TIMEOUT });
  // Give React time to mount and trigger API calls so the loader can appear (then we wait for it to go)
  await page.waitForTimeout(600);
  await waitForLoaderDone(page);
  if (waitForDetached) {
    await page.waitForSelector(waitForDetached, { state: 'detached', timeout: LOADER_GONE_TIMEOUT }).catch(() => {});
  }
  if (waitForSelector) {
    await page.waitForSelector(waitForSelector, { state: 'visible', timeout: LOADER_GONE_TIMEOUT });
  }
  await page.waitForTimeout(extraDelay);
  // Remove global loader from DOM right before capture so it never appears in the screenshot
  await page.evaluate(() => {
    const el = document.querySelector('.global-loader-overlay');
    if (el) el.remove();
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT_DIR, outputFile), fullPage: false });
  console.log('  ' + outputFile);
}

async function main() {
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }
  console.log('Saving screenshots to:', OUT_DIR);
  console.log('Base URL:', BASE_URL);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    ignoreHTTPSErrors: true,
  });

  // Hide global loader on every page load so screenshots never show the overlay
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem('hide_loader_for_screenshot', '1');
    } catch (_) {}
  });

  try {
    const page = await context.newPage();

    // 1. Login page (no auth) – always capture first
    try {
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: join(OUT_DIR, 'login.png'), fullPage: false });
      console.log('  login.png');
    } catch (e) {
      console.error('  Could not capture login.png. Is the app running at', BASE_URL, '?', e.message);
    }

    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      console.log('Set ADMIN_EMAIL, ADMIN_PASSWORD (and TENANT_ID) then run again to capture dashboard, enquiries, etc.');
      return;
    }

    // 2. Set tenant and login as tenant admin
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    await page.evaluate(
      (tid) => {
        if (tid) localStorage.setItem('gym_tenant_id', tid);
      },
      TENANT_ID || '',
    );
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => u.pathname !== '/login', { timeout: 10000 }).catch(() => {});

    const pathname = new URL(page.url()).pathname;
    if (pathname === '/login') {
      console.warn('  Login failed (still on /login). Check TENANT_ID, ADMIN_EMAIL, ADMIN_PASSWORD.');
    } else {
      // Capture each page only after loaders are gone and content is visible
      try {
        await gotoAndCapture(page, `${BASE_URL}/`, 'dashboard.png', {
          waitForSelector: '.dashboard-view .dc-value, .dashboard-view .dash-card',
          extraDelay: 400,
        });
      } catch (e) {
        console.error('  dashboard.png failed:', e.message);
      }

      try {
        await gotoAndCapture(page, `${BASE_URL}/enquiries`, 'enquiries.png', {
          waitForSelector: '.enquiries-list, .enquiries-empty, .enquiries-page',
          extraDelay: 400,
        });
      } catch (e) {
        console.error('  enquiries.png failed:', e.message);
      }

      try {
        await gotoAndCapture(page, `${BASE_URL}/onboarding`, 'onboarding.png', {
          waitForSelector: '.onboarding-page, .section-desc, [class*="onboarding"]',
          extraDelay: 400,
        });
      } catch (e) {
        console.error('  onboarding.png failed:', e.message);
      }

      try {
        await gotoAndCapture(page, `${BASE_URL}/nutrition-ai`, 'nutrition-ai.png', {
          waitForDetached: '.nutrition-loading',
          waitForSelector: '.nutrition-ai-page .staff-members-widget, .nutrition-ai-page .analysis-widget, .nutrition-ai-page .today-widget',
          extraDelay: 500,
        });
      } catch (e) {
        console.error('  nutrition-ai.png failed:', e.message);
      }
    }

    // 3. Platform Admin (super admin login)
    if (SUPER_ADMIN_EMAIL && SUPER_ADMIN_PASSWORD) {
      await page.goto(BASE_URL);
      await page.evaluate(() => {
        localStorage.removeItem('gym_tenant_id');
        localStorage.removeItem('gym_token');
        localStorage.removeItem('gym_role');
      });
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.fill('input[type="email"]', SUPER_ADMIN_EMAIL);
      await page.fill('input[type="password"]', SUPER_ADMIN_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL((u) => u.pathname !== '/login', { timeout: 10000 }).catch(() => {});
      const path2 = new URL(page.url()).pathname;
      if (path2 === '/platform' || path2 === '/') {
        try {
          await gotoAndCapture(page, `${BASE_URL}/platform`, 'platform-admin.png', {
            waitForDetached: '.platform-loading',
            waitForSelector: '.platform-admin',
            extraDelay: 400,
          });
        } catch (e) {
          console.error('  platform-admin.png failed:', e.message);
        }
      } else {
        console.warn('  Super admin login failed; skipping platform-admin.png');
      }
    } else {
      console.log('  (Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD to capture platform-admin.png)');
    }
  } finally {
    await browser.close();
  }

  console.log('Done. Regenerate the pitch PDF from Platform Admin to include these screenshots.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
