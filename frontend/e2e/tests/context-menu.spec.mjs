import { test, expect } from '@playwright/test';
import { LensAppPage }       from '../pages/lens-app.page.mjs';
import { SwimlanePage }      from '../pages/swimlane.page.mjs';
import { RepoDetailPage }    from '../pages/repo-detail.page.mjs';
import { FolderViewPage }    from '../pages/folder-view.page.mjs';
import { MappingEditorPage } from '../pages/mapping-editor.page.mjs';

const CSV      = new URL('../CommitHistory.csv', import.meta.url).pathname;
const MAPPINGS = new URL('../mappings.json',      import.meta.url).pathname;

// ── "Create new context" path ──────────────────────────────────────────────

test.describe('Context menu — Create new context from swimlane repo node', () => {
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

  test('context menu lists existing contexts and a "Create new context…" option', async ({ page }) => {
    await swimlane.rightClickRepoNode('backend-api');
    await page.waitForTimeout(200);
    expect(await mappingEditor.contextMenuHasExistingContexts()).toBe(true);
    const names = await mappingEditor.getContextMenuContextNames();
    // mappings.json defines "Data Platform"
    expect(names.some(n => n.includes('Data Platform'))).toBe(true);
    // The "Create new" option is always present
    await expect(page.locator('.ctx-menu-item--new')).toBeVisible();
  });

  test('header reads "Add to context" for an unassigned repo', async ({ page }) => {
    await swimlane.rightClickRepoNode('backend-api');
    await page.waitForTimeout(200);
    const header = await mappingEditor.getContextMenuSectionHeader();
    expect(header.trim()).toBe('Add to context');
  });

  test('clicking "Create new context…" opens the Mapping panel on the Contexts tab', async ({ page }) => {
    await swimlane.rightClickRepoNode('backend-api');
    await page.waitForTimeout(200);
    await mappingEditor.clickCreateNewContextMenuItem();
    expect(await mappingEditor.isContextsTabActive()).toBe(true);
  });

  test('pending creation form is shown after clicking "Create new context…"', async ({ page }) => {
    await swimlane.rightClickRepoNode('backend-api');
    await page.waitForTimeout(200);
    await mappingEditor.clickCreateNewContextMenuItem();
    expect(await mappingEditor.isPendingConfirmationVisible()).toBe(true);
  });

  test('confirming the form creates a new bounded context card', async ({ page }) => {
    await swimlane.rightClickRepoNode('backend-api');
    await page.waitForTimeout(200);
    await mappingEditor.clickCreateNewContextMenuItem();
    const countBefore = await mappingEditor.getContextCardCount();
    await mappingEditor.confirmNewContext('Backend Bundle');
    expect(await mappingEditor.getContextCardCount()).toBe(countBefore + 1);
  });

  test('pending form clears after confirming', async ({ page }) => {
    await swimlane.rightClickRepoNode('backend-api');
    await page.waitForTimeout(200);
    await mappingEditor.clickCreateNewContextMenuItem();
    await mappingEditor.confirmNewContext('Backend Bundle');
    expect(await mappingEditor.isPendingConfirmationVisible()).toBe(false);
  });

  test('new context card includes the source repo in its description', async ({ page }) => {
    await swimlane.rightClickRepoNode('backend-api');
    await page.waitForTimeout(200);
    await mappingEditor.clickCreateNewContextMenuItem();
    await mappingEditor.confirmNewContext('Backend Bundle');
    const descs = await mappingEditor.getSourceDescriptions();
    expect(descs.some(d => d.includes('backend-api'))).toBe(true);
  });
});

// ── Direct assignment path ─────────────────────────────────────────────────

test.describe('Context menu — Direct assignment to existing context', () => {
  let app, swimlane, mappingEditor;

  test.beforeEach(async ({ page }) => {
    app           = new LensAppPage(page);
    swimlane      = new SwimlanePage(page);
    mappingEditor = new MappingEditorPage(page);
    await app.setup(CSV, MAPPINGS);
  });

  test('clicking an existing context assigns directly and shows a toast', async ({ page }) => {
    await swimlane.rightClickRepoNode('backend-api');
    await page.waitForTimeout(200);
    await mappingEditor.clickAssignToContextMenuItem('Data Platform');
    expect(await mappingEditor.isToastVisible()).toBe(true);
    const msg = await mappingEditor.getToastText();
    expect(msg).toContain('Data Platform');
  });

  test('direct assignment does not open the mapping panel', async ({ page }) => {
    await swimlane.rightClickRepoNode('backend-api');
    await page.waitForTimeout(200);
    await mappingEditor.clickAssignToContextMenuItem('Data Platform');
    expect(await mappingEditor.isContextsTabActive()).toBe(false);
  });

  test('after direct assignment the source appears in the context card', async ({ page }) => {
    await swimlane.rightClickRepoNode('backend-api');
    await page.waitForTimeout(200);
    await mappingEditor.clickAssignToContextMenuItem('Data Platform');
    // Open the mapping editor manually to verify
    await page.locator('.floating-mapping-btn').click();
    await page.locator('.tab-btn').filter({ hasText: 'Contexts' }).click();
    const descs = await mappingEditor.getSourceDescriptions();
    expect(descs.some(d => d.includes('backend-api'))).toBe(true);
  });
});

// ── Change context path ────────────────────────────────────────────────────

test.describe('Context menu — Change context for already-assigned folder', () => {
  let app, swimlane, repoDetail, folderView, mappingEditor;

  test.beforeEach(async ({ page }) => {
    app           = new LensAppPage(page);
    swimlane      = new SwimlanePage(page);
    repoDetail    = new RepoDetailPage(page);
    folderView    = new FolderViewPage(page);
    mappingEditor = new MappingEditorPage(page);
    await app.setup(CSV, MAPPINGS);

    // Create a second context "New Home" before we start assigning
    await page.locator('.floating-mapping-btn').click();
    await page.locator('.tab-btn').filter({ hasText: 'Contexts' }).click();
    await page.locator('.add-team-btn').click();
    await page.locator('.ctx-card').last().locator('.team-name-input').fill('New Home');
    await page.locator('.close-btn').click();

    // Navigate to backend-api folder drill-down
    await swimlane.openRepoDetail('backend-api');
    await page.waitForSelector('.detail-title', { state: 'visible' });
    await repoDetail.clickRepoCenterCircle();

    // Assign the first drillable folder to "Data Platform"
    await folderView.rightClickFirstDrillableFolder();
    await page.waitForTimeout(200);
    await mappingEditor.clickAssignToContextMenuItem('Data Platform');
    await page.waitForTimeout(200);
  });

  test('header reads "Change context" when the source is already assigned', async ({ page }) => {
    await folderView.rightClickFirstDrillableFolder();
    await page.waitForTimeout(200);
    const header = await mappingEditor.getContextMenuSectionHeader();
    expect(header.trim()).toBe('Change context');
  });

  test('the currently assigned context shows a checkmark', async ({ page }) => {
    await folderView.rightClickFirstDrillableFolder();
    await page.waitForTimeout(200);
    expect(await mappingEditor.contextMenuItemHasCheckmark('Data Platform')).toBe(true);
  });

  test('reassigning shows a "Moved to" toast', async ({ page }) => {
    await folderView.rightClickFirstDrillableFolder();
    await page.waitForTimeout(200);
    await mappingEditor.clickAssignToContextMenuItem('New Home');
    expect(await mappingEditor.isToastVisible()).toBe(true);
    const msg = await mappingEditor.getToastText();
    expect(msg).toContain('Moved to');
    expect(msg).toContain('New Home');
  });
});

// ── Duplicate-name guard ───────────────────────────────────────────────────

test.describe('Context menu — Duplicate context name guard', () => {
  let app, swimlane, mappingEditor;

  test.beforeEach(async ({ page }) => {
    app           = new LensAppPage(page);
    swimlane      = new SwimlanePage(page);
    mappingEditor = new MappingEditorPage(page);
    await app.setup(CSV, MAPPINGS);
    await swimlane.rightClickRepoNode('backend-api');
    await page.waitForTimeout(200);
    await mappingEditor.clickCreateNewContextMenuItem();
  });

  test('typing a name that matches an existing context shows the dupe warning', async ({ page }) => {
    await page.locator('.ctx-pending .ctx-new-name-input').fill('Data Platform');
    await page.waitForTimeout(100);
    expect(await mappingEditor.isDupeWarningVisible()).toBe(true);
  });

  test('"Create & assign" is disabled while the dupe warning is shown', async ({ page }) => {
    await page.locator('.ctx-pending .ctx-new-name-input').fill('Data Platform');
    await page.waitForTimeout(100);
    const btn = page.locator('.ctx-pending .modal-btn--confirm');
    await expect(btn).toBeDisabled();
  });

  test('"Assign to it" assigns the source to the existing context and closes the form', async ({ page }) => {
    await page.locator('.ctx-pending .ctx-new-name-input').fill('Data Platform');
    await page.waitForTimeout(100);
    await mappingEditor.clickAssignToDuplicate();
    expect(await mappingEditor.isPendingConfirmationVisible()).toBe(false);
    const descs = await mappingEditor.getSourceDescriptions();
    expect(descs.some(d => d.includes('backend-api'))).toBe(true);
  });

  test('"Create new" dismisses the warning and allows confirming with the same name', async ({ page }) => {
    await page.locator('.ctx-pending .ctx-new-name-input').fill('Data Platform');
    await page.waitForTimeout(100);
    await mappingEditor.clickDismissDupeWarning();
    expect(await mappingEditor.isDupeWarningVisible()).toBe(false);
    const btn = page.locator('.ctx-pending .modal-btn--confirm');
    await expect(btn).toBeEnabled();
  });
});

// ── Folder drill-down path ─────────────────────────────────────────────────

test.describe('Context menu — Create new context from folder drill-down', () => {
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
    await mappingEditor.clickCreateNewContextMenuItem();
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
    await mappingEditor.clickCreateNewContextMenuItem();
    expect(await mappingEditor.isPendingConfirmationVisible()).toBe(true);
    const countBefore = await mappingEditor.getContextCardCount();
    await mappingEditor.confirmNewContext('Leaf Context');
    expect(await mappingEditor.getContextCardCount()).toBe(countBefore + 1);
    const descs = await mappingEditor.getSourceDescriptions();
    expect(descs.some(d => d.includes('backend-api') && d.includes('/'))).toBe(true);
  });

  test('direct assignment from folder menu adds source without opening the panel', async ({ page }) => {
    const found = await folderView.rightClickFirstDrillableFolder();
    expect(found).toBe(true);
    await mappingEditor.clickAssignToContextMenuItem('Data Platform');
    expect(await mappingEditor.isToastVisible()).toBe(true);
    expect(await mappingEditor.isContextsTabActive()).toBe(false);
  });
});
