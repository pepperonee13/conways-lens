import { test, expect } from '@playwright/test';
import { LensAppPage }      from '../pages/lens-app.page.mjs';
import { BubblesPage }      from '../pages/bubbles.page.mjs';
import { ContextAuthorPage } from '../pages/context-author.page.mjs';

const CSV      = new URL('../CommitHistory.csv', import.meta.url).pathname;
const MAPPINGS = new URL('../mappings.json',      import.meta.url).pathname;

test.describe('Bubbles (circle-pack) view', () => {
  let app, bubbles, contextAuthor;

  test.beforeEach(async ({ page }) => {
    app           = new LensAppPage(page);
    bubbles       = new BubblesPage(page);
    contextAuthor = new ContextAuthorPage(page);
    await app.setup(CSV, MAPPINGS);
    await app.switchToBubbles();
  });

  test('Bubbles toggle becomes active after switching', async () => {
    await expect(app.viewToggleBubbles).toHaveClass(/active/);
    await expect(app.viewToggleSwimlane).not.toHaveClass(/active/);
  });

  test('team bubbles are rendered', async () => {
    const count = await bubbles.getTeamBubbleCount();
    expect(count).toBeGreaterThan(0);
  });

  test('hovering a team bubble shows a tooltip', async () => {
    const tooltipText = await bubbles.hoverTeamBubble('Backend');
    expect(tooltipText.length).toBeGreaterThan(0);
  });

  test('clicking a team bubble reveals its context bubbles', async () => {
    await bubbles.clickTeamBubble('Backend');
    const count = await bubbles.getVisibleContextBubbleCount();
    expect(count).toBeGreaterThan(0);
  });

  test('Data team has exactly 1 context node (Data Platform merged)', async () => {
    const count = await bubbles.getContextBubbleCountByTeam('data');
    expect(count).toBe(1);
  });

  test('"Data Platform" label appears on the Data team context bubble', async () => {
    const label = await bubbles.getContextBubbleLabelText('data');
    expect(label).toContain('Data Platform');
  });

  test('hovering a context bubble shows a drill-down tooltip', async () => {
    await bubbles.clickTeamBubble('Backend');
    const tooltipText = await bubbles.hoverVisibleContextBubble();
    expect(tooltipText).toContain('Click to see author contributions');
  });

  test('clicking a context bubble opens the repo detail view', async () => {
    await bubbles.clickTeamBubble('Backend');
    await bubbles.clickVisibleContextBubbleByName('backend-api');
    expect(await contextAuthor.isDetailTitleVisible()).toBe(true);
  });

  test('clicking a multi-source context bubble expands it inline', async () => {
    await bubbles.clickTeamBubble('Backend');
    // ctx-auth has 2 path sources — clicking should expand inline showing source bubbles
    await bubbles.clickVisibleContextBubbleByName('ctx-auth');
    const sourceCount = await bubbles.getExpandedContextSourceCount();
    expect(sourceCount).toBeGreaterThan(0);
  });

  test('switching back to Swimlane removes team bubble elements', async () => {
    await app.switchToSwimlane();
    expect(await bubbles.isTeamBubbleAbsent()).toBe(true);
  });
});
