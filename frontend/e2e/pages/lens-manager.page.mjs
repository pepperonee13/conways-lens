export class LensManagerPage {
  constructor(page) {
    this.page = page;
  }

  async open() {
    await this.page.click('[data-testid="fab-lenses"]');
  }

  async close() {
    await this.page.click('.panel .close-btn');
  }

  async saveLens(name) {
    await this.page.fill('.lens-name-input', name);
    await this.page.click('button:has-text("Save")');
  }

  async loadLens(name) {
    await this.page
      .locator('.lens-row', { hasText: name })
      .locator('[title="Load lens"]')
      .click();
  }

  async overwriteLens(name) {
    await this.page
      .locator('.lens-row', { hasText: name })
      .locator('[title="Overwrite with current state"]')
      .click();
  }

  async deleteLens(name) {
    await this.page
      .locator('.lens-row', { hasText: name })
      .locator('[title="Delete lens"]')
      .click();
  }

  async renameLens(oldName, newName) {
    await this.page.locator('.lens-row .lens-name', { hasText: oldName }).dblclick();
    await this.page.fill('.lens-rename-input', newName);
    await this.page.keyboard.press('Enter');
  }

  async getLensNames() {
    return this.page.locator('.lens-row .lens-name').allTextContents();
  }

  activeLensChip() {
    return this.page.locator('.active-lens-chip');
  }

  activeLensRowCount() {
    return this.page.locator('.lens-row--active').count();
  }
}
