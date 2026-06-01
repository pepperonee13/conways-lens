import { resolve, basename } from 'path';
import { readFileSync } from 'fs';

const SETTLE_MS = 1500;
const IMPORT_MS = 800;

export class LensAppPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
  }

  /** Navigate to the app and load both fixture files. */
  async setup(csvPath, mappingsPath) {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
    await this.loadCSV(csvPath);
    await this.importMappings(mappingsPath);
  }

  /** Simulate drag-drop of a CSV file onto the app. */
  async loadCSV(csvPath) {
    const text = readFileSync(resolve(csvPath), 'utf8');
    const name = basename(csvPath);
    await this.page.evaluate(({ text, name }) => {
      const file = new File([text], name, { type: 'text/csv' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const target = document.querySelector('.lens-app') ?? document.body;
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    }, { text, name });
    await this.page.waitForTimeout(SETTLE_MS);
  }

  /** Import team mappings via the MappingEditor's hidden file input. */
  async importMappings(jsonPath) {
    const abs = resolve(jsonPath);
    await this.page.click('[data-testid="fab-mapping"]');
    await this.page.waitForTimeout(400);
    await this.page.locator('input[type=file][accept=".json"]').setInputFiles(abs);
    await this.page.waitForTimeout(IMPORT_MS);
    await this.page.locator('.backdrop').dispatchEvent('click');
    await this.page.waitForSelector('.backdrop', { state: 'detached', timeout: 8000 });
  }

  /** Clear localStorage before each test to prevent state bleed. */
  async clearLocalStorage() {
    await this.page.evaluate(() => localStorage.clear());
  }

  async switchToSwimlane() {
    await this.page.click('button:has-text("Swimlane")');
    await this.page.waitForTimeout(800);
  }

  async switchToBubbles() {
    await this.page.click('button:has-text("Bubbles")');
    await this.page.waitForTimeout(800);
  }

  async closeDetailView() {
    if (await this.page.locator('.back-btn').isVisible()) {
      await this.page.locator('.back-btn').click();
      await this.page.waitForTimeout(500);
    }
  }

  // ── Locator getters ───────────────────────────────────────────────────────

  get graphTooltip() { return this.page.locator('.graph-tooltip'); }
  get backBtn()       { return this.page.locator('.back-btn'); }
  get violationBanner() { return this.page.locator('.violation-banner'); }
  get viewToggleSwimlane() { return this.page.locator('.view-toggle-btn').filter({ hasText: 'Swimlane' }); }
  get viewToggleBubbles()  { return this.page.locator('.view-toggle-btn').filter({ hasText: 'Bubbles' }); }
}
