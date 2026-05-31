export class FolderViewPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
  }

  async isBreadcrumbVisible() {
    return this.page.locator('.folder-breadcrumb').isVisible();
  }

  async getBreadcrumbRepoBtnText() {
    return (await this.page.locator('.breadcrumb-repo').textContent()).trim();
  }

  async getBreadcrumbItems() {
    return this.page.locator('.breadcrumb-item').allTextContents();
  }

  async getCurrentBreadcrumbSegment() {
    return (await this.page.locator('.breadcrumb-current').textContent()).trim();
  }

  async clickBreadcrumbRepo() {
    await this.page.locator('.breadcrumb-repo').click();
    await this.page.waitForTimeout(500);
  }

  /** Click a breadcrumb segment (excluding the repo root and current segment) by zero-based index. */
  async clickBreadcrumbSegmentAt(index) {
    await this.page.locator('.breadcrumb-item:not(.breadcrumb-repo):not(.breadcrumb-current)')
      .nth(index).click();
    await this.page.waitForTimeout(500);
  }

  async getFolderNodeCount() {
    return this.page.evaluate(() =>
      Array.from(document.querySelectorAll('svg rect')).filter(r => r.getAttribute('fill-opacity') === '0.45').length
    );
  }

  async getTeamPillCount() {
    return this.page.evaluate(() =>
      Array.from(document.querySelectorAll('svg rect')).filter(r => r.getAttribute('fill-opacity') === '0.95').length
    );
  }

  async getEdgeCount() {
    return this.page.evaluate(() =>
      Array.from(document.querySelectorAll('svg path')).filter(p => p.getAttribute('marker-end')).length
    );
  }

  async getDrillableFolderCount() {
    return this.page.evaluate(() =>
      Array.from(document.querySelectorAll('svg text')).filter(t => t.textContent.trim() === '›').length
    );
  }

  /**
   * Find the first drillable folder (has a › indicator).
   * Returns { x, y, label } for the folder group, or null if none exists.
   */
  async findFirstDrillableFolder() {
    return this.page.evaluate(() => {
      const arrow = Array.from(document.querySelectorAll('svg text')).find(t => t.textContent.trim() === '›');
      if (!arrow) return null;
      const g = arrow.closest('g');
      const box = g.getBoundingClientRect();
      const label = Array.from(g.querySelectorAll('text'))
        .find(t => t.getAttribute('font-weight') === '600')?.textContent.trim();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2, label };
    });
  }

  /** Click into the first drillable folder. Returns the folder label, or null if none found. */
  async drillIntoFirstFolder() {
    const target = await this.findFirstDrillableFolder();
    if (!target) return null;
    await this.page.mouse.click(target.x, target.y);
    await this.page.waitForTimeout(600);
    return target.label;
  }

  /**
   * Find a leaf folder (folder node without a › drill indicator).
   * Returns { x, y } or null.
   */
  async findLeafFolder() {
    return this.page.evaluate(() => {
      const allFolderGs = Array.from(document.querySelectorAll('svg rect[fill-opacity="0.45"]'))
        .map(r => r.closest('g'))
        .filter(Boolean);
      const drillableGs = new Set(
        Array.from(document.querySelectorAll('svg text'))
          .filter(t => t.textContent.trim() === '›')
          .map(t => t.closest('g'))
      );
      const leaf = allFolderGs.find(g => !drillableGs.has(g));
      if (!leaf) return null;
      const b = leaf.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
  }

  async clickLeafFolder() {
    const target = await this.findLeafFolder();
    if (!target) return;
    await this.page.mouse.click(target.x, target.y);
    await this.page.waitForTimeout(300);
  }

  /** Click the first team pill in folder mode to expand it (showing individual authors). */
  async expandTeamPill() {
    const coords = await this.page.evaluate(() => {
      const r = Array.from(document.querySelectorAll('svg rect[fill-opacity="0.95"]'))[0];
      if (!r) return null;
      const g = r.closest('g');
      const b = g.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    if (!coords) throw new Error('No team pill found in folder view');
    await this.page.mouse.click(coords.x, coords.y);
    await this.page.waitForTimeout(600);
  }

  /** Right-click the first drillable folder (has › indicator). Returns true if found. */
  async rightClickFirstDrillableFolder() {
    const target = await this.findFirstDrillableFolder();
    if (!target) return false;
    await this.page.mouse.click(target.x, target.y, { button: 'right' });
    await this.page.waitForTimeout(200);
    return true;
  }

  /** Right-click the first leaf folder (no › indicator). Returns true if found. */
  async rightClickLeafFolder() {
    const target = await this.findLeafFolder();
    if (!target) return false;
    await this.page.mouse.click(target.x, target.y, { button: 'right' });
    await this.page.waitForTimeout(200);
    return true;
  }

  async getAuthorCircleCount() {
    return this.page.evaluate(() =>
      Array.from(document.querySelectorAll('svg circle'))
        .filter(c => {
          const r = parseFloat(c.getAttribute('r'));
          return r > 0 && r < 30 && c.getAttribute('opacity') === '0.92';
        }).length
    );
  }
}
