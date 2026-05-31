import { test, expect } from '@playwright/test';
import { LensAppPage }       from '../pages/lens-app.page.mjs';
import { SwimlanePage }      from '../pages/swimlane.page.mjs';
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
