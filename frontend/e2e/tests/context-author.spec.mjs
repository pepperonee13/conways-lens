import { test, expect } from '@playwright/test';
import { LensAppPage }       from '../pages/lens-app.page.mjs';
import { BubblesPage }       from '../pages/bubbles.page.mjs';
import { ContextAuthorPage } from '../pages/context-author.page.mjs';
import { FolderViewPage }    from '../pages/folder-view.page.mjs';

const CSV      = new URL('../CommitHistory.csv', import.meta.url).pathname;
const MAPPINGS = new URL('../mappings.json',      import.meta.url).pathname;

test.describe('Context author detail and folder drill-down', () => {
  let app, bubbles, contextAuthor, folderView;

  test.beforeEach(async ({ page }) => {
    app           = new LensAppPage(page);
    bubbles       = new BubblesPage(page);
    contextAuthor = new ContextAuthorPage(page);
    folderView    = new FolderViewPage(page);
    await app.setup(CSV, MAPPINGS);
    await app.switchToBubbles();
    await bubbles.clickTeamBubble('Backend');
    await bubbles.clickVisibleContextBubbleByName('backend-api');
    await page.waitForSelector('.detail-title', { state: 'visible' });
  });

  test('detail title shows the repo name', async () => {
    const title = await contextAuthor.getDetailTitle();
    expect(title).toContain('backend-api');
  });

  test('breadcrumb is not visible in author radial mode', async () => {
    expect(await contextAuthor.isBreadcrumbVisible()).toBe(false);
  });

  test('repo center circle is present and has a pointer cursor', async () => {
    const circle = await contextAuthor.getRepoCenterCircle();
    expect(circle).not.toBeNull();
    expect(circle.cursor).toBe('pointer');
  });

  test('hovering the center circle shows the folder-explore tooltip', async () => {
    const tooltipText = await contextAuthor.hoverRepoCenterCircle();
    expect(tooltipText).toContain('Click to explore folder structure');
  });

  test('clicking the center circle enters folder mode', async () => {
    await contextAuthor.clickRepoCenterCircle();
    expect(await folderView.isBreadcrumbVisible()).toBe(true);
  });

  test('breadcrumb shows the repo name after entering folder mode', async () => {
    await contextAuthor.clickRepoCenterCircle();
    expect(await folderView.getBreadcrumbRepoBtnText()).toBe('backend-api');
  });

  test('folder nodes are rendered at root level', async () => {
    await contextAuthor.clickRepoCenterCircle();
    expect(await folderView.getFolderNodeCount()).toBeGreaterThan(0);
  });

  test('team pills are present at root level', async () => {
    await contextAuthor.clickRepoCenterCircle();
    expect(await folderView.getTeamPillCount()).toBeGreaterThan(0);
  });

  test('directed edges connect teams to folder nodes', async () => {
    await contextAuthor.clickRepoCenterCircle();
    expect(await folderView.getEdgeCount()).toBeGreaterThan(0);
  });

  test('drilling into a folder updates the breadcrumb', async () => {
    await contextAuthor.clickRepoCenterCircle();
    const drilledLabel = await folderView.drillIntoFirstFolder();
    expect(drilledLabel).toBeTruthy();
    const items = await folderView.getBreadcrumbItems();
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(await folderView.getCurrentBreadcrumbSegment()).toBe(drilledLabel);
  });

  test('clicking the breadcrumb repo name returns to author radial view', async () => {
    await contextAuthor.clickRepoCenterCircle();
    await folderView.drillIntoFirstFolder();
    await folderView.clickBreadcrumbRepo();
    expect(await contextAuthor.isDetailTitleVisible()).toBe(true);
    expect(await contextAuthor.isBreadcrumbVisible()).toBe(false);
  });

  test('clicking a leaf folder does not advance the breadcrumb', async () => {
    await contextAuthor.clickRepoCenterCircle();
    await folderView.drillIntoFirstFolder();
    const itemsBefore = await folderView.getBreadcrumbItems();
    await folderView.clickLeafFolder();
    const itemsAfter = await folderView.getBreadcrumbItems();
    expect(itemsAfter.length).toBe(itemsBefore.length);
  });

  test('expanding a team pill in folder mode reveals author circles', async () => {
    await contextAuthor.clickRepoCenterCircle();
    await folderView.expandTeamPill();
    expect(await folderView.getAuthorCircleCount()).toBeGreaterThan(0);
  });

  test('drilling two levels deep extends the breadcrumb to 3+ items', async () => {
    await contextAuthor.clickRepoCenterCircle();
    await folderView.drillIntoFirstFolder();
    const l2Label = await folderView.drillIntoFirstFolder();
    expect(l2Label).toBeTruthy();
    const items = await folderView.getBreadcrumbItems();
    expect(items.length).toBeGreaterThanOrEqual(3);
  });

  test('clicking an intermediate breadcrumb segment navigates back and updates current', async () => {
    await contextAuthor.clickRepoCenterCircle();
    const l1Label = await folderView.drillIntoFirstFolder();
    await folderView.drillIntoFirstFolder();
    const itemsBefore = await folderView.getBreadcrumbItems();
    await folderView.clickBreadcrumbSegmentAt(0);
    const itemsAfter = await folderView.getBreadcrumbItems();
    expect(itemsAfter.length).toBeLessThan(itemsBefore.length);
    expect(await folderView.getCurrentBreadcrumbSegment()).toBe(l1Label);
  });
});
