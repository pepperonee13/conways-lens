import { test, expect } from '@playwright/test';
import { LensAppPage }     from '../pages/lens-app.page.mjs';
import { LensManagerPage } from '../pages/lens-manager.page.mjs';

const CSV      = new URL('../CommitHistory.csv', import.meta.url).pathname;
const MAPPINGS = new URL('../mappings.json',      import.meta.url).pathname;

test.describe('Named Lenses', () => {
  let app, lm;

  test.beforeEach(async ({ page }) => {
    app = new LensAppPage(page);
    lm  = new LensManagerPage(page);
    await app.setup(CSV, MAPPINGS);
  });

  test('Lenses button is visible after data is loaded', async ({ page }) => {
    await expect(page.locator('button:has-text("Lenses")')).toBeVisible();
  });

  test('saves current config as a named lens', async () => {
    await lm.open();
    await lm.saveLens('Client A');
    const names = await lm.getLensNames();
    expect(names).toContain('Client A');
  });

  test('badge on Lenses button shows saved lens count', async ({ page }) => {
    await lm.open();
    await lm.saveLens('Client A');
    await lm.close();
    const badge = page.locator('.floating-lens-btn .lens-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('1');
  });

  test('shows active lens name in header chip after saving', async () => {
    await lm.open();
    await lm.saveLens('Client A');
    await lm.close();
    await expect(lm.activeLensChip()).toBeVisible();
    await expect(lm.activeLensChip()).toContainText('Client A');
  });

  test('clicking header chip opens the Lenses panel', async ({ page }) => {
    await lm.open();
    await lm.saveLens('Client A');
    await lm.close();
    await lm.activeLensChip().click();
    await expect(page.locator('.panel .panel-title')).toBeVisible();
  });

  test('loaded lens is marked active in the list', async () => {
    await lm.open();
    await lm.saveLens('Client A');
    await lm.saveLens('Client B');
    await lm.loadLens('Client A');
    // Panel closes after load; reopen to check
    await lm.open();
    expect(await lm.activeLensRowCount()).toBe(1);
    await expect(lm.activeLensChip()).toContainText('Client A');
  });

  test('renames a lens inline', async () => {
    await lm.open();
    await lm.saveLens('Draft');
    await lm.renameLens('Draft', 'Production');
    const names = await lm.getLensNames();
    expect(names).toContain('Production');
    expect(names).not.toContain('Draft');
  });

  test('deletes a lens', async () => {
    await lm.open();
    await lm.saveLens('Temporary');
    await lm.deleteLens('Temporary');
    const names = await lm.getLensNames();
    expect(names).not.toContain('Temporary');
  });

  test('deleting the active lens clears the header chip', async () => {
    await lm.open();
    await lm.saveLens('Solo');
    await lm.close();
    await expect(lm.activeLensChip()).toBeVisible();
    await lm.open();
    await lm.deleteLens('Solo');
    await lm.close();
    await expect(lm.activeLensChip()).not.toBeVisible();
  });

  test('multiple lenses can be saved and listed', async () => {
    await lm.open();
    await lm.saveLens('Client A');
    await lm.saveLens('Client B');
    const names = await lm.getLensNames();
    expect(names).toContain('Client A');
    expect(names).toContain('Client B');
  });

  test('switching between lenses updates the header chip', async () => {
    await lm.open();
    await lm.saveLens('Client A');
    await lm.saveLens('Client B');
    await lm.loadLens('Client A');
    await expect(lm.activeLensChip()).toContainText('Client A');
  });
});
