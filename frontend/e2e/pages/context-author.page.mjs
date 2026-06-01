export class ContextAuthorPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
  }

  async getDetailTitle() {
    return this.page.locator('.detail-title').textContent();
  }

  async isDetailTitleVisible() {
    return this.page.locator('.detail-title').isVisible();
  }

  async isBreadcrumbVisible() {
    return this.page.locator('.folder-breadcrumb').isVisible();
  }

  /**
   * Find the large central repo circle (r > 30, fill-opacity="0.45").
   * Returns { x, y, cursor } viewport coordinates + computed cursor style, or null.
   */
  async getRepoCenterCircle() {
    return this.page.evaluate(() => {
      const c = Array.from(document.querySelectorAll('svg circle'))
        .find(c => parseFloat(c.getAttribute('r')) > 30 && c.getAttribute('fill-opacity') === '0.45');
      if (!c) return null;
      const box = c.getBoundingClientRect();
      return {
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
        cursor: window.getComputedStyle(c.parentElement).cursor,
      };
    });
  }

  /** Hover the repo center circle and return the tooltip text. */
  async hoverRepoCenterCircle() {
    const circle = await this.getRepoCenterCircle();
    if (!circle) throw new Error('Repo center circle not found');
    await this.page.mouse.move(circle.x, circle.y);
    await this.page.waitForSelector('.graph-tooltip', { state: 'visible', timeout: 8000 });
    await this.page.waitForTimeout(150);
    return this.page.locator('.graph-tooltip').textContent();
  }

  /** Click the repo center circle to enter folder drill-down mode. */
  async clickRepoCenterCircle() {
    const circle = await this.getRepoCenterCircle();
    if (!circle) throw new Error('Repo center circle not found');
    await this.page.mouse.click(circle.x, circle.y);
    await this.page.waitForTimeout(600);
  }

  /**
   * Click a team pill (svg rect fill-opacity="0.95") to expand/collapse it.
   * Pass teamName to target a specific team, or omit to click the first pill found.
   */
  async expandTeamPill(teamName = null) {
    const coords = await this.page.evaluate((name) => {
      const pills = Array.from(document.querySelectorAll('svg rect[fill-opacity="0.95"]'));
      let target;
      if (name) {
        target = pills.find(r => {
          const g = r.closest('g');
          return Array.from(g?.querySelectorAll('text') ?? [])
            .some(t => t.textContent.trim() === name);
        });
      } else {
        target = pills[0];
      }
      if (!target) return null;
      const g = target.closest('g');
      const box = g.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }, teamName);
    if (!coords) throw new Error(`Team pill not found${teamName ? `: "${teamName}"` : ''}`);
    await this.page.mouse.click(coords.x, coords.y);
    await this.page.waitForTimeout(600);
  }

  /** Count author circles (small circles with opacity="0.92"). */
  async getAuthorCircleCount() {
    return this.page.evaluate(() =>
      Array.from(document.querySelectorAll('svg circle'))
        .filter(c => {
          const r = parseFloat(c.getAttribute('r'));
          return r > 0 && r < 30 && c.getAttribute('opacity') === '0.92';
        }).length
    );
  }

  async getEdgeCount() {
    return this.page.evaluate(() =>
      Array.from(document.querySelectorAll('svg path')).filter(p => p.getAttribute('marker-end')).length
    );
  }
}
