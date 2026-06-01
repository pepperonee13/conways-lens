export class BubblesPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
  }

  async getTeamBubbleCount() {
    return this.page.evaluate(() => document.querySelectorAll('.team-bubble').length);
  }

  /** Find a team bubble by its text label, hover its circle, and return the tooltip text. */
  async hoverTeamBubble(teamName) {
    const center = await this._teamBubbleCenter(teamName);
    if (!center) throw new Error(`Team bubble not found: "${teamName}"`);
    await this.page.mouse.move(center.x, center.y);
    await this.page.waitForSelector('.graph-tooltip', { state: 'visible', timeout: 8000 });
    return this.page.locator('.graph-tooltip').textContent();
  }

  /** Click a team bubble to expand it, exposing its context bubbles. */
  async clickTeamBubble(teamName) {
    const center = await this._teamBubbleCenter(teamName);
    if (!center) throw new Error(`Team bubble not found: "${teamName}"`);
    await this.page.mouse.click(center.x, center.y);
    await this.page.waitForTimeout(500);
  }

  /** Count .repo-bubble elements that are currently visible (not hidden via display:none). */
  async getVisibleContextBubbleCount() {
    return this.page.evaluate(() =>
      Array.from(document.querySelectorAll('.repo-bubble'))
        .filter(el => el.style.display !== 'none').length
    );
  }

  /**
   * Count all context bubbles belonging to a team by data-team-id attribute.
   * Does not require the team to be expanded — elements are always in the DOM.
   */
  async getContextBubbleCountByTeam(teamId) {
    return this.page.evaluate((id) =>
      document.querySelectorAll(`.repo-bubble[data-team-id="${id}"]`).length
    , teamId);
  }

  /** Return the concatenated text content of all <text> elements in a team's context bubble. */
  async getContextBubbleLabelText(teamId) {
    return this.page.evaluate((id) => {
      const b = document.querySelector(`.repo-bubble[data-team-id="${id}"]`);
      if (!b) return null;
      return Array.from(b.querySelectorAll('text'))
        .map(t => t.textContent.trim()).filter(Boolean).join(' ');
    }, teamId);
  }

  /** Hover the first visible context bubble and return the tooltip text. */
  async hoverVisibleContextBubble() {
    const center = await this._visibleContextBubbleCenter();
    if (!center) throw new Error('No visible context bubble found');
    await this.page.mouse.move(center.x, center.y);
    await this.page.waitForSelector('.graph-tooltip', { state: 'visible', timeout: 8000 });
    await this.page.waitForTimeout(150);
    return this.page.locator('.graph-tooltip').textContent();
  }

  /** Click the first visible context bubble. */
  async clickVisibleContextBubble() {
    const center = await this._visibleContextBubbleCenter();
    if (!center) throw new Error('No visible context bubble found');
    await this.page.mouse.click(center.x, center.y);
    await this.page.waitForTimeout(800);
  }

  /**
   * Click a visible context bubble by context ID or partial name match.
   * Checks data-context-id first, then falls back to text prefix (first 6 chars).
   */
  async clickVisibleContextBubbleByName(nameOrId) {
    const center = await this.page.evaluate((n) => {
      // Try exact match by data-context-id
      const byId = document.querySelector(`.repo-bubble[data-context-id="${n}"]`);
      if (byId && byId.style.display !== 'none') {
        const circle = byId.querySelector('circle');
        if (circle) {
          const box = circle.getBoundingClientRect();
          return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        }
      }
      // Fall back to text prefix match
      const prefix = n.slice(0, 6);
      const visible = Array.from(document.querySelectorAll('.repo-bubble'))
        .filter(el => el.style.display !== 'none')
        .find(el => Array.from(el.querySelectorAll('text'))
          .some(t => t.textContent.trim().toLowerCase().startsWith(prefix.toLowerCase())));
      if (!visible) return null;
      const circle = visible.querySelector('circle');
      if (!circle) return null;
      const box = circle.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }, nameOrId);
    if (!center) throw new Error(`Context bubble not found: "${nameOrId}"`);
    await this.page.mouse.click(center.x, center.y);
    await this.page.waitForTimeout(800);
  }

  /** Hover a visible context bubble by name and return the tooltip text. */
  async hoverContextBubbleByName(nameOrId) {
    const center = await this.page.evaluate((n) => {
      const byId = document.querySelector(`.repo-bubble[data-context-id="${n}"]`);
      if (byId && byId.style.display !== 'none') {
        const circle = byId.querySelector('circle');
        if (circle) { const b = circle.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
      }
      const prefix = n.slice(0, 6).toLowerCase();
      const visible = Array.from(document.querySelectorAll('.repo-bubble'))
        .filter(el => el.style.display !== 'none')
        .find(el => Array.from(el.querySelectorAll('text')).some(t => t.textContent.trim().toLowerCase().startsWith(prefix)));
      if (!visible) return null;
      const circle = visible.querySelector('circle');
      if (!circle) return null;
      const b = circle.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    }, nameOrId);
    if (!center) throw new Error(`Context bubble not found: "${nameOrId}"`);
    await this.page.mouse.move(center.x, center.y);
    await this.page.waitForSelector('.graph-tooltip', { state: 'visible', timeout: 8000 });
    await this.page.waitForTimeout(150);
    return this.page.locator('.graph-tooltip').textContent();
  }

  async isTeamBubbleAbsent() {
    return this.page.evaluate(() => document.querySelectorAll('.team-bubble').length === 0);
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  async _teamBubbleCenter(teamName) {
    return this.page.evaluate((name) => {
      for (const g of document.querySelectorAll('.team-bubble')) {
        const label = Array.from(g.querySelectorAll('text'))
          .find(t => t.textContent.trim() === name);
        if (!label) continue;
        const circle = g.querySelector('circle');
        if (!circle) continue;
        const box = circle.getBoundingClientRect();
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      }
      return null;
    }, teamName);
  }

  async _visibleContextBubbleCenter() {
    return this.page.evaluate(() => {
      const visible = Array.from(document.querySelectorAll('.repo-bubble'))
        .find(el => el.style.display !== 'none');
      if (!visible) return null;
      const circle = visible.querySelector('circle');
      if (!circle) return null;
      const box = circle.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    });
  }
}
