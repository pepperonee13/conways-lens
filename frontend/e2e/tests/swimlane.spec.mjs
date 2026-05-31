import { test, expect } from '@playwright/test';
import { LensAppPage }   from '../pages/lens-app.page.mjs';
import { SwimlanePage }  from '../pages/swimlane.page.mjs';

const CSV      = new URL('../CommitHistory.csv', import.meta.url).pathname;
const MAPPINGS = new URL('../mappings.json',      import.meta.url).pathname;

test.describe('Swimlane view', () => {
  let app, swimlane;

  test.beforeEach(async ({ page }) => {
    app      = new LensAppPage(page);
    swimlane = new SwimlanePage(page);
    await app.setup(CSV, MAPPINGS);
  });

  test('Swimlane toggle is active by default', async () => {
    await expect(app.viewToggleSwimlane).toHaveClass(/active/);
    await expect(app.viewToggleBubbles).not.toHaveClass(/active/);
  });

  test('directed edges are present between teams and contexts', async () => {
    const count = await swimlane.getEdgeCount();
    expect(count).toBeGreaterThan(0);
  });

  test('"Data Platform" multi-repo context label is rendered', async () => {
    expect(await swimlane.hasContextLabel('Data Platform')).toBe(true);
  });

  test('"data-pipeline" is not shown as a separate context label', async () => {
    expect(await swimlane.hasContextLabel('data-pipeline')).toBe(false);
  });

  test('"analytics-db" is not shown as a separate context label', async () => {
    expect(await swimlane.hasContextLabel('analytics-db')).toBe(false);
  });

  test('hovering a team anchor node shows a non-empty tooltip', async ({ page }) => {
    const tooltipText = await swimlane.hoverTeamAnchor();
    expect(tooltipText.length).toBeGreaterThan(0);
    await expect(page.locator('.graph-tooltip')).toBeVisible();
  });

  test('right-clicking a repo node shows the context menu', async ({ page }) => {
    const found = await swimlane.rightClickRepoNode('backend-api');
    expect(found).toBe(true);
    await page.waitForTimeout(200);
    await expect(page.locator('.ctx-menu')).toBeVisible();
  });
});
