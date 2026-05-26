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
   * Click the first repo node in the swimlane to open the repo detail graph.
   * Pass a repo name to target a specific one.
   */
  async openRepoDetail(repoName = null) {
    await this.page.evaluate((name) => {
      const candidates = Array.from(document.querySelectorAll('svg text'))
        .filter(t => t.closest('g')?.querySelector('circle.repo-fill'));
      const target = name
        ? candidates.find(t => t.textContent.trim().startsWith(name.slice(0, 8)))
        : candidates[0];
      target?.closest('g')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, repoName);
    await this.page.waitForTimeout(800);
  }

  /**
   * Hover over the first team anchor node in the swimlane and return tooltip
   * position data: { anchorX, anchorY, tipLeft, tipTop, tipRight, tipBottom,
   * isBelow, isLeft, transform }.
   */
  async measureTeamTooltipDirection() {
    const anchor = await this.page.evaluate(() => {
      const t = Array.from(document.querySelectorAll('svg text'))
        .find(t => t.getAttribute('font-weight') === '700' && t.textContent.trim().length > 0);
      const box = t?.closest('g')?.getBoundingClientRect();
      return box ? { cx: box.x + box.width / 2, cy: box.y + box.height / 2 } : null;
    });
    if (!anchor) throw new Error('No team anchor found in SVG');
    await this.page.mouse.move(anchor.cx, anchor.cy);
    await this.page.waitForSelector('.graph-tooltip', { state: 'visible', timeout: 3000 });
    await this.page.waitForTimeout(200);
    return this.page.evaluate(({ cx, cy }) => {
      const tip  = document.querySelector('.graph-tooltip');
      const rect = tip.getBoundingClientRect();
      return {
        anchorX: cx, anchorY: cy,
        tipLeft: rect.left, tipTop: rect.top,
        tipRight: rect.right, tipBottom: rect.bottom,
        isBelow: rect.top > cy,
        isLeft:  rect.right <= cx + 5,
        transform: window.getComputedStyle(tip).transform,
      };
    }, anchor);
  }

  /**
   * Return geometry for every pct badge circle in the current SVG.
   * Each entry: { label, r, textHalfW, gap } — gap is clearance from text edge to circle.
   * Requires the repo detail view to be open.
   */
  async measureBadgeGeometry() {
    return this.page.evaluate(() =>
      Array.from(document.querySelectorAll('svg circle[fill="#fff"][stroke-width="2"]'))
        .map(c => {
          const r    = parseFloat(c.getAttribute('r'));
          const text = c.parentElement?.querySelector('text');
          if (!text) return null;
          const bbox = text.getBBox();
          return {
            label:     text.textContent.trim(),
            r:         +r.toFixed(2),
            textHalfW: +(bbox.width / 2).toFixed(2),
            gap:       +(r - bbox.width / 2).toFixed(2),
          };
        }).filter(Boolean)
    );
  }

  /**
   * Return { label, rendered } pairs for all repo nodes in the swimlane.
   * `label` is the truncated rendered text; use to verify ellipsis truncation.
   */
  async getRepoLabels() {
    return this.page.evaluate(() =>
      Array.from(document.querySelectorAll('svg text'))
        .filter(t => t.closest('g')?.querySelector('circle.repo-fill'))
        .map(t => ({ label: t.textContent.trim() }))
    );
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
