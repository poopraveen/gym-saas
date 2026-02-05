// Playwright: used by scripts/capture-pitch-screenshots.mjs for pitch PDF screenshots.
// Add @playwright/test and e2e tests in ./e2e later if needed.
// Run: npm run capture-pitch-screenshots (with app + API running)
module.exports = {
  timeout: 30000,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    viewport: { width: 1280, height: 900 },
  },
};
