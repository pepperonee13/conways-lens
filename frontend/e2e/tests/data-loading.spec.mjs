import { test, expect } from '@playwright/test';
import { LensAppPage } from '../pages/lens-app.page.mjs';

const CSV      = new URL('../CommitHistory.csv', import.meta.url).pathname;
const MAPPINGS = new URL('../mappings.json',      import.meta.url).pathname;

test.describe('Data loading', () => {
  let app;

  test.beforeEach(async ({ page }) => {
    app = new LensAppPage(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('landing page shows upload zone before any data is loaded', async ({ page }) => {
    await expect(page.locator('.landing-grid')).toBeVisible();
  });

  test('graph area renders after CSV is loaded', async ({ page }) => {
    await app.loadCSV(CSV);
    await expect(page.locator('.graph-wrap')).toBeVisible();
  });

  test('violation banner is hidden when no team mappings are loaded', async ({ page }) => {
    await app.loadCSV(CSV);
    await expect(app.violationBanner).not.toBeVisible();
  });

  test('swimlane toggle is active after full setup (CSV + mappings)', async () => {
    await app.setup(CSV, MAPPINGS);
    await expect(app.viewToggleSwimlane).toHaveClass(/active/);
  });

  test('violation banner shows 7 total contexts after adding ctx-auth', async () => {
    await app.setup(CSV, MAPPINGS);
    // After adding ctx-auth (2 sources) and cross-team commits to it, there are 7 total contexts
    await expect(app.violationBanner).toContainText('out of 7 ');
  });
});
