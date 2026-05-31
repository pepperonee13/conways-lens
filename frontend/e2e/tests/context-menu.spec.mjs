import { test, expect } from '@playwright/test';
import { LensAppPage }       from '../pages/lens-app.page.mjs';
import { SwimlanePage }      from '../pages/swimlane.page.mjs';
import { RepoDetailPage }    from '../pages/repo-detail.page.mjs';
import { FolderViewPage }    from '../pages/folder-view.page.mjs';
import { MappingEditorPage } from '../pages/mapping-editor.page.mjs';

const CSV      = new URL('../CommitHistory.csv', import.meta.url).pathname;
const MAPPINGS = new URL('../mappings.json',      import.meta.url).pathname;

test.describe('Context menu — Add to bounded context', () => {
  let app, swimlane, mappingEditor;

  test.beforeEach(async ({ page }) => {
    app           = new LensAppPage(page);
    swimlane      = new SwimlanePage(page);
    mappingEditor = new MappingEditorPage(page);
    await app.setup(CSV, MAPPINGS);
  });

  test('right-clicking a repo node opens the context menu', async ({ page }) => {
    const found = await swimlane.rightClickRepoNode('backend-api');
    expect(found).toBe(true);
    await page.waitForTimeout(200);
    expect(await mappingEditor.isContextMenuVisible()).toBe(true);
  });

  test('clicking the context menu item opens the Mapping panel on the Contexts tab', async ({ page }) => {
    await swimlane.rightClickRepoNode('backend-api');
    await page.waitForTimeout(200);
    await mappingEditor.clickContextMenuItem();
    expect(await mappingEditor.isContextsTabActive()).toBe(true);
  });

  test('pending source confirmation is shown after the menu item is clicked', async ({ page }) => {
    await swimlane.rightClickRepoNode('backend-api');
    await page.waitForTimeout(200);
    await mappingEditor.clickContextMenuItem();
    expect(await mappingEditor.isPendingConfirmationVisible()).toBe(true);
  });

  test('confirming creates a new bounded context card', async ({ page }) => {
    await swimlane.rightClickRepoNode('backend-api');
    await page.waitForTimeout(200);
    await mappingEditor.clickContextMenuItem();
    const countBefore = await mappingEditor.getContextCardCount();
    await mappingEditor.confirmNewContext('Backend Bundle');
    expect(await mappingEditor.getContextCardCount()).toBe(countBefore + 1);
  });

  test('pending confirmation clears after confirming', async ({ page }) => {
    await swimlane.rightClickRepoNode('backend-api');
    await page.waitForTimeout(200);
    await mappingEditor.clickContextMenuItem();
    await mappingEditor.confirmNewContext('Backend Bundle');
    expect(await mappingEditor.isPendingConfirmationVisible()).toBe(false);
  });

  test('new context card includes the source repo in its description', async ({ page }) => {
    await swimlane.rightClickRepoNode('backend-api');
    await page.waitForTimeout(200);
    await mappingEditor.clickContextMenuItem();
    await mappingEditor.confirmNewContext('Backend Bundle');
    const descs = await mappingEditor.getSourceDescriptions();
    expect(descs.some(d => d.includes('backend-api'))).toBe(true);
  });
});

test.describe('Context menu — Add to bounded context from folder drill-down', () => {
  let app, swimlane, repoDetail, folderView, mappingEditor;

  test.beforeEach(async ({ page }) => {
    app           = new LensAppPage(page);
    swimlane      = new SwimlanePage(page);
    repoDetail    = new RepoDetailPage(page);
    folderView    = new FolderViewPage(page);
    mappingEditor = new MappingEditorPage(page);
    await app.setup(CSV, MAPPINGS);
    await swimlane.openRepoDetail('backend-api');
    await page.waitForSelector('.detail-title', { state: 'visible' });
    await repoDetail.clickRepoCenterCircle();
  });

  test('adding a drillable folder creates a path-type bounded context source', async ({ page }) => {
    const found = await folderView.rightClickFirstDrillableFolder();
    expect(found).toBe(true);
    expect(await mappingEditor.isContextMenuVisible()).toBe(true);
    await mappingEditor.clickContextMenuItem();
    expect(await mappingEditor.isPendingConfirmationVisible()).toBe(true);
    const countBefore = await mappingEditor.getContextCardCount();
    await mappingEditor.confirmNewContext('Folder Context');
    expect(await mappingEditor.getContextCardCount()).toBe(countBefore + 1);
    const descs = await mappingEditor.getSourceDescriptions();
    expect(descs.some(d => d.includes('backend-api') && d.includes('/'))).toBe(true);
  });

  test('adding a leaf folder creates a path-type bounded context source', async ({ page }) => {
    await folderView.drillIntoFirstFolder();
    await folderView.drillIntoFirstFolder();
    const found = await folderView.rightClickLeafFolder();
    expect(found).toBe(true);
    expect(await mappingEditor.isContextMenuVisible()).toBe(true);
    await mappingEditor.clickContextMenuItem();
    expect(await mappingEditor.isPendingConfirmationVisible()).toBe(true);
    const countBefore = await mappingEditor.getContextCardCount();
    await mappingEditor.confirmNewContext('Leaf Context');
    expect(await mappingEditor.getContextCardCount()).toBe(countBefore + 1);
    const descs = await mappingEditor.getSourceDescriptions();
    expect(descs.some(d => d.includes('backend-api') && d.includes('/'))).toBe(true);
  });
});
