import { test, expect } from '@playwright/test';
import { LensAppPage }      from '../pages/lens-app.page.mjs';
import { BubblesPage }      from '../pages/bubbles.page.mjs';
import { ContextAuthorPage } from '../pages/context-author.page.mjs';

const CSV = new URL('../CommitHistory.csv', import.meta.url).pathname;

/** Dismiss the driver.js spotlight overlay (Escape key) so pointer events reach the UI. */
async function dismissSpotlight(page) {
  const overlay = page.locator('.driver-overlay');
  if (await overlay.isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.keyboard.press('Escape');
    await page.waitForSelector('.driver-overlay', { state: 'detached', timeout: 5000 });
  }
}

test.describe('Unassigned Contributors bubble — CSV with no mappings', () => {
  test('driver.js mapping spotlight is shown after CSV upload', async ({ page }) => {
    const app = new LensAppPage(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await app.loadCSV(CSV);

    // driver.js injects .driver-popover into the DOM when the spotlight is active
    await expect(page.locator('.driver-popover')).toBeVisible({ timeout: 5000 });
    const title = await page.locator('.driver-popover-title').textContent();
    expect(title).toContain('Configure Teams');
  });

  test.describe('bubble interactions', () => {
    let app, bubbles, contextAuthor;

    test.beforeEach(async ({ page }) => {
      app           = new LensAppPage(page);
      bubbles       = new BubblesPage(page);
      contextAuthor = new ContextAuthorPage(page);

      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await app.loadCSV(CSV);
      // Dismiss the mapping spotlight so it doesn't block pointer events
      await dismissSpotlight(page);
      await app.switchToBubbles();
    });

    test('Unassigned Contributors bubble is rendered', async () => {
      const count = await bubbles.getTeamBubbleCount();
      expect(count).toBeGreaterThan(0);

      const hasUnassigned = await bubbles.page.evaluate(() =>
        Array.from(document.querySelectorAll('.team-bubble'))
          .some(g => Array.from(g.querySelectorAll('text'))
            .some(t => t.textContent.includes('Unassigned')))
      );
      expect(hasUnassigned).toBe(true);
    });

    test('hovering the Unassigned Contributors bubble shows a tooltip', async () => {
      const tooltipText = await bubbles.hoverTeamBubble('Unassigned Contributors');
      expect(tooltipText.length).toBeGreaterThan(0);
    });

    test('clicking the Unassigned Contributors bubble reveals context bubbles', async () => {
      await bubbles.clickTeamBubble('Unassigned Contributors');
      const count = await bubbles.getVisibleContextBubbleCount();
      expect(count).toBeGreaterThan(0);
    });

    test('hovering an expanded context bubble shows the drill-down tooltip', async () => {
      await bubbles.clickTeamBubble('Unassigned Contributors');
      const tooltipText = await bubbles.hoverVisibleContextBubble();
      expect(tooltipText).toContain('Click to see author contributions');
    });

    test('clicking an expanded context bubble opens the author detail view', async () => {
      await bubbles.clickTeamBubble('Unassigned Contributors');
      await bubbles.clickVisibleContextBubble();
      expect(await contextAuthor.isDetailTitleVisible()).toBe(true);
    });
  });
});
