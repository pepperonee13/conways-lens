export class SwimlanePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
  }

  /** Click a repo node by name to open the repo detail view. */
  async openRepoDetail(repoName) {
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

  /** Dispatch a contextmenu event on a repo node. Returns true if the node was found. */
  async rightClickRepoNode(repoName) {
    return this.page.evaluate((name) => {
      const candidates = Array.from(document.querySelectorAll('svg text'))
        .filter(t => t.closest('g')?.querySelector('circle.repo-fill'));
      const textEl = name
        ? candidates.find(t => t.textContent.trim().startsWith(name.slice(0, 8)))
        : candidates[0];
      const g = textEl?.closest('g');
      if (!g) return false;
      const box = g.getBoundingClientRect();
      g.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true,
        clientX: box.x + box.width / 2, clientY: box.y + box.height / 2,
      }));
      return true;
    }, repoName);
  }

  /** Return the text content of all font-weight="600" SVG labels (context names). */
  async getContextLabelTexts() {
    return this.page.evaluate(() =>
      Array.from(document.querySelectorAll('svg text[font-weight="600"]'))
        .map(t => t.textContent.trim())
        .filter(Boolean)
    );
  }

  async hasContextLabel(name) {
    const labels = await this.getContextLabelTexts();
    return labels.includes(name);
  }

  async getViolationBannerText() {
    return this.page.locator('.violation-banner').textContent();
  }

  /** Count directed edges (svg path elements with an arrowhead marker). */
  async getEdgeCount() {
    return this.page.evaluate(() =>
      Array.from(document.querySelectorAll('svg path')).filter(p => p.getAttribute('marker-end')).length
    );
  }

  /**
   * Hover the first team anchor node (font-weight="700") and return the tooltip text.
   * Waits for the tooltip to appear before returning.
   */
  async hoverTeamAnchor() {
    const anchor = await this.page.evaluate(() => {
      const t = Array.from(document.querySelectorAll('svg text'))
        .find(t => t.getAttribute('font-weight') === '700' && t.textContent.trim().length > 0);
      const box = t?.closest('g')?.getBoundingClientRect();
      return box ? { cx: box.x + box.width / 2, cy: box.y + box.height / 2 } : null;
    });
    if (!anchor) throw new Error('No team anchor found in SVG');
    await this.page.mouse.move(anchor.cx, anchor.cy);
    await this.page.waitForSelector('.graph-tooltip', { state: 'visible', timeout: 8000 });
    return this.page.locator('.graph-tooltip').textContent();
  }
}
