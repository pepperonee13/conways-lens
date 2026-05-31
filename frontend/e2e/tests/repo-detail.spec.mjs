import { test, expect } from '@playwright/test';
import { LensAppPage }    from '../pages/lens-app.page.mjs';
import { SwimlanePage }   from '../pages/swimlane.page.mjs';
import { RepoDetailPage } from '../pages/repo-detail.page.mjs';
import { FolderViewPage } from '../pages/folder-view.page.mjs';

const CSV      = new URL('../CommitHistory.csv', import.meta.url).pathname;
const MAPPINGS = new URL('../mappings.json',      import.meta.url).pathname;

test.describe('Repo detail and folder drill-down', () => {
  let app, swimlane, repoDetail, folderView;

  test.beforeEach(async ({ page }) => {
    app        = new LensAppPage(page);
    swimlane   = new SwimlanePage(page);
    repoDetail = new RepoDetailPage(page);
    folderView = new FolderViewPage(page);
    await app.setup(CSV, MAPPINGS);
    await swimlane.openRepoDetail('backend-api');
    await page.waitForSelector('.detail-title', { state: 'visible' });
  });

  test('detail title shows the repo name', async () => {
    const title = await repoDetail.getDetailTitle();
    expect(title).toContain('backend-api');
  });

  test('breadcrumb is not visible in author radial mode', async () => {
    expect(await repoDetail.isBreadcrumbVisible()).toBe(false);
  });

  test('repo center circle is present and has a pointer cursor', async () => {
    const circle = await repoDetail.getRepoCenterCircle();
    expect(circle).not.toBeNull();
    expect(circle.cursor).toBe('pointer');
  });

  test('hovering the center circle shows the folder-explore tooltip', async () => {
    const tooltipText = await repoDetail.hoverRepoCenterCircle();
    expect(tooltipText).toContain('Click to explore folder structure');
  });

  test('clicking the center circle enters folder mode', async () => {
    await repoDetail.clickRepoCenterCircle();
    expect(await folderView.isBreadcrumbVisible()).toBe(true);
  });

  test('breadcrumb shows the repo name after entering folder mode', async () => {
    await repoDetail.clickRepoCenterCircle();
    expect(await folderView.getBreadcrumbRepoBtnText()).toBe('backend-api');
  });

  test('folder nodes are rendered at root level', async () => {
    await repoDetail.clickRepoCenterCircle();
    expect(await folderView.getFolderNodeCount()).toBeGreaterThan(0);
  });

  test('team pills are present at root level', async () => {
    await repoDetail.clickRepoCenterCircle();
    expect(await folderView.getTeamPillCount()).toBeGreaterThan(0);
  });

  test('directed edges connect teams to folder nodes', async () => {
    await repoDetail.clickRepoCenterCircle();
    expect(await folderView.getEdgeCount()).toBeGreaterThan(0);
  });

  test('drilling into a folder updates the breadcrumb', async () => {
    await repoDetail.clickRepoCenterCircle();
    const drilledLabel = await folderView.drillIntoFirstFolder();
    expect(drilledLabel).toBeTruthy();
    const items = await folderView.getBreadcrumbItems();
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(await folderView.getCurrentBreadcrumbSegment()).toBe(drilledLabel);
  });

  test('clicking the breadcrumb repo name returns to author radial view', async () => {
    await repoDetail.clickRepoCenterCircle();
    await folderView.drillIntoFirstFolder();
    await folderView.clickBreadcrumbRepo();
    expect(await repoDetail.isDetailTitleVisible()).toBe(true);
    expect(await repoDetail.isBreadcrumbVisible()).toBe(false);
  });

  test('clicking a leaf folder does not advance the breadcrumb', async () => {
    await repoDetail.clickRepoCenterCircle();
    await folderView.drillIntoFirstFolder();
    const itemsBefore = await folderView.getBreadcrumbItems();
    await folderView.clickLeafFolder();
    const itemsAfter = await folderView.getBreadcrumbItems();
    expect(itemsAfter.length).toBe(itemsBefore.length);
  });

  test('expanding a team pill in folder mode reveals author circles', async () => {
    await repoDetail.clickRepoCenterCircle();
    await folderView.expandTeamPill();
    expect(await folderView.getAuthorCircleCount()).toBeGreaterThan(0);
  });
});
