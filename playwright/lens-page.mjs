/**
 * ConwayLens Page Object Model
 *
 * Usage:
 *   import { LensPage } from './playwright/lens-page.mjs';
 *   const lens = await LensPage.open(page, 'http://localhost:5174');
 *   await lens.loadCSV('sample-data/TimelineData.csv');
 *   await lens.importMappings('sample-data/mappings.json');
 *   await lens.expandNode('Backend');
 *   await lens.screenshot('out.png');
 */

import { resolve } from 'path';

const SETTLE_MS  = 1800; // wait after expand/collapse for simulation to settle
const IMPORT_MS  = 800;  // wait after import for store to update

export class LensPage {
  /** @param {import('playwright').Page} page */
  constructor(page) {
    this.page = page;
  }

  /**
   * Launch a new browser page pointed at the app and return a LensPage.
   * Waits for the page to be idle before returning.
   */
  static async open(browser, url = 'http://localhost:5174') {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    return new LensPage(page);
  }

  /** Upload a CSV file via the "Load file" button. */
  async loadCSV(csvPath) {
    const abs = resolve(csvPath);
    const [fc] = await Promise.all([
      this.page.waitForEvent('filechooser'),
      this.page.click('label.load-btn'),
    ]);
    await fc.setFiles(abs);
    await this.page.waitForTimeout(1500);
  }

  /** Open the Mapping panel, import a JSON file, then close the panel. */
  async importMappings(jsonPath) {
    const abs = resolve(jsonPath);
    await this.page.click('button:has-text("Mapping")');
    await this.page.waitForTimeout(400);
    const [fc] = await Promise.all([
      this.page.waitForEvent('filechooser'),
      this.page.click('button:has-text("Import JSON")'),
    ]);
    await fc.setFiles(abs);
    await this.page.waitForTimeout(IMPORT_MS);
    await this.page.click('.backdrop', { force: true });
    await this.page.waitForTimeout(1200);
  }

  /**
   * Click a named SVG node (team pill, repo square, author circle) by its label text.
   * Waits for the simulation to settle afterward.
   */
  async expandNode(name) {
    await this._clickSvgLabel(name);
    await this.page.waitForTimeout(SETTLE_MS);
  }

  /** Collapse an already-expanded team by clicking its anchor pill. */
  async collapseNode(name) {
    await this._clickSvgLabel(name);
    await this.page.waitForTimeout(SETTLE_MS);
  }

  /**
   * Move the pointer over a named SVG node and wait for the tooltip to appear.
   * Returns the tooltip text content.
   */
  async hoverNode(name) {
    const el = await this._svgLabelEl(name);
    if (!el) throw new Error(`Node not found in SVG: "${name}"`);
    const box = await el.boundingBox();
    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await this.page.waitForSelector('.graph-tooltip', { state: 'visible', timeout: 3000 });
    return this.page.locator('.graph-tooltip').textContent();
  }

  /**
   * Take a screenshot and save it to outPath.
   * outPath is relative to the repo root.
   */
  async screenshot(outPath) {
    const abs = resolve(outPath);
    await this.page.screenshot({ path: abs });
    return abs;
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  async _svgLabelEl(name) {
    return this.page.evaluateHandle((n) => {
      return Array.from(document.querySelectorAll('svg text'))
        .find(el => el.textContent.trim() === n) ?? null;
    }, name);
  }

  async _clickSvgLabel(name) {
    await this.page.evaluate((n) => {
      const el = Array.from(document.querySelectorAll('svg text'))
        .find(t => t.textContent.trim() === n);
      el?.closest('g')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, name);
  }
}
