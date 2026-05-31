export class MappingEditorPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
  }

  async isContextsTabActive() {
    return this.page.locator('.tab-btn.active').filter({ hasText: 'Contexts' }).isVisible();
  }

  async isPendingConfirmationVisible() {
    return this.page.locator('.ctx-pending').isVisible();
  }

  async getContextCardCount() {
    return this.page.locator('.ctx-card').count();
  }

  /**
   * Click the "Create new context…" entry in the right-click context menu.
   * This opens the mapping editor's Contexts tab with the pending creation form.
   */
  async clickCreateNewContextMenuItem() {
    await this.page.locator('.ctx-menu-item--new').click();
    await this.page.waitForTimeout(400);
  }

  /** Backward-compatible alias — still routes to "Create new context…". */
  async clickContextMenuItem() {
    return this.clickCreateNewContextMenuItem();
  }

  /**
   * Click an existing context name in the right-click context menu for direct
   * assignment (no mapping editor opened).
   */
  async clickAssignToContextMenuItem(contextName) {
    await this.page.locator('.ctx-menu-item--context').filter({ hasText: contextName }).click();
    await this.page.waitForTimeout(300);
  }

  /**
   * Get the section header text from the context menu
   * ("Add to context" or "Change context").
   */
  async getContextMenuSectionHeader() {
    return this.page.locator('.ctx-menu-section-header').textContent();
  }

  /**
   * Returns true when the context menu lists existing contexts (any .ctx-menu-item--context).
   */
  async contextMenuHasExistingContexts() {
    return (await this.page.locator('.ctx-menu-item--context').count()) > 0;
  }

  /**
   * Returns text of all existing-context items in the right-click menu.
   */
  async getContextMenuContextNames() {
    return this.page.locator('.ctx-menu-item--context').allTextContents();
  }

  /**
   * Returns true if the context entry with the given name shows a checkmark
   * (meaning the source is currently assigned to that context).
   */
  async contextMenuItemHasCheckmark(contextName) {
    const item = this.page.locator('.ctx-menu-item--context').filter({ hasText: contextName });
    const check = item.locator('.ctx-menu-check');
    return (await check.textContent()).includes('✓');
  }

  /**
   * Complete the pending "Create new bounded context" form:
   * fills the context name and clicks "Create & assign".
   */
  async confirmNewContext(contextName) {
    await this.page.locator('.ctx-pending .ctx-new-name-input').fill(contextName);
    await this.page.locator('.ctx-pending .modal-btn--confirm').click();
    await this.page.waitForTimeout(400);
  }

  /** Returns true when the duplicate-name warning banner is shown. */
  async isDupeWarningVisible() {
    return this.page.locator('.ctx-dupe-warning').isVisible();
  }

  /** Click "Assign to it" inside the duplicate-name warning. */
  async clickAssignToDuplicate() {
    await this.page.locator('.ctx-dupe-btn--assign').click();
    await this.page.waitForTimeout(300);
  }

  /** Click "Create new" inside the duplicate-name warning (dismisses it). */
  async clickDismissDupeWarning() {
    await this.page.locator('.ctx-dupe-btn--new').click();
    await this.page.waitForTimeout(100);
  }

  async getSourceDescriptions() {
    return this.page.locator('.ctx-source-desc').allTextContents();
  }

  async isContextMenuVisible() {
    return this.page.locator('.ctx-menu').isVisible();
  }

  /** Returns true when at least one toast notification is on screen. */
  async isToastVisible() {
    return (await this.page.locator('.toast').count()) > 0;
  }

  /** Returns the text of the most-recently added toast. */
  async getToastText() {
    return this.page.locator('.toast').last().textContent();
  }
}
