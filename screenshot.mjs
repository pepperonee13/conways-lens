import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH  = resolve(__dirname, 'sample-data/TimelineData.csv');
const JSON_PATH = resolve(__dirname, 'sample-data/mappings.json');
const OUT       = resolve(__dirname, 'sample-data');

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page    = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });
await page.goto('http://localhost:5174');
await page.waitForLoadState('networkidle');

// ── Load CSV via the "Load CSV" button (file chooser) ────────────────────────
const [fc1] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.click('label.load-btn'),
]);
await fc1.setFiles(CSV_PATH);
await page.waitForTimeout(1500);

// ── Screenshot 1 — data loaded, no teams ────────────────────────────────────
await page.screenshot({ path: `${OUT}/01-no-teams.png` });
console.log('✓ 01-no-teams.png');

// ── Import team mappings ─────────────────────────────────────────────────────
await page.click('button:has-text("Mapping")');
await page.waitForTimeout(500);

const [fc2] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.click('button:has-text("Import JSON")'),
]);
await fc2.setFiles(JSON_PATH);
await page.waitForTimeout(800);

// Close panel by clicking the backdrop
await page.click('.backdrop', { force: true });
await page.waitForTimeout(1200);

// ── Screenshot 2 — collapsed team view (default) ────────────────────────────
await page.screenshot({ path: `${OUT}/02-teams-collapsed.png` });
console.log('✓ 02-teams-collapsed.png');

// ── Turn on Edge weight ──────────────────────────────────────────────────────
await page.locator('.cross-team-btn', { hasText: 'Visualization' }).click();
await page.waitForTimeout(400);
await page.click('.viz-toggle-btn');
await page.waitForTimeout(800);

// ── Screenshot 3 — edge weight on, teams collapsed ──────────────────────────
await page.screenshot({ path: `${OUT}/03-edge-weight.png` });
console.log('✓ 03-edge-weight.png');

// Close viz panel
await page.mouse.click(600, 150);
await page.waitForTimeout(300);

// ── Expand Backend team ──────────────────────────────────────────────────────
await page.evaluate(() => {
  const t = Array.from(document.querySelectorAll('svg text')).find(el => el.textContent.trim() === 'Backend');
  t?.closest('g')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await page.waitForTimeout(1800);

// ── Screenshot 4 — Backend expanded, edge weight on ─────────────────────────
await page.screenshot({ path: `${OUT}/04-backend-expanded.png` });
console.log('✓ 04-backend-expanded.png');

// ── Cross-team only filter ───────────────────────────────────────────────────
await page.click('button:has-text("Cross-team only")');
await page.waitForTimeout(1000);

await page.screenshot({ path: `${OUT}/05-cross-team-only.png` });
console.log('✓ 05-cross-team-only.png');

// ── Expand all teams ─────────────────────────────────────────────────────────
await page.click('button:has-text("Cross-team only")'); // turn off filter
await page.waitForTimeout(400);

for (const name of ['Frontend', 'Data', 'Platform']) {
  await page.evaluate((n) => {
    const t = Array.from(document.querySelectorAll('svg text')).find(el => el.textContent.trim() === n);
    t?.closest('g')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, name);
  await page.waitForTimeout(900);
}
await page.waitForTimeout(1500); // let simulation settle

// ── Screenshot 6 — all teams expanded ───────────────────────────────────────
await page.screenshot({ path: `${OUT}/06-all-expanded.png` });
console.log('✓ 06-all-expanded.png');

await browser.close();
console.log('\nAll screenshots saved to sample-data/');
