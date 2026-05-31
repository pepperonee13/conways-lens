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
   * Complete the pending "Add to bounded context" confirmation flow:
   * clicks the "New context…" pill, fills the context name, and clicks confirm.
   */
  async confirmNewContext(contextName) {
    await this.page.locator('.ctx-pending .ctx-target-pill--new').click();
    await this.page.locator('.ctx-pending .ctx-new-name-input').fill(contextName);
    await this.page.locator('.ctx-pending .modal-btn--confirm').click();
    await this.page.waitForTimeout(400);
  }

  async getSourceDescriptions() {
    return this.page.locator('.ctx-source-desc').allTextContents();
  }

  async isContextMenuVisible() {
    return this.page.locator('.ctx-menu').isVisible();
  }

  async clickContextMenuItem() {
    await this.page.locator('.ctx-menu-item').click();
    await this.page.waitForTimeout(400);
  }
}
