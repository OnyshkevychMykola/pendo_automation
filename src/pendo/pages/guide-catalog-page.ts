import type { Page } from 'playwright';
import { SELECTORS } from '../selectors.js';
import { AutomationError } from '../../errors/automation-error.js';
import { ErrorCode } from '../../errors/error-codes.js';

export interface GuideRow {
  name: string;
  url: string;
}

export class GuideCatalogPage {
  constructor(private readonly page: Page) {}

  async navigate(baseUrl: string): Promise<void> {
    await this.page.goto(`${baseUrl}/guides`, { waitUntil: 'domcontentloaded' });
    await this.page.locator(SELECTORS.catalog.guidesTable).waitFor({ timeout: 15000 });
  }

  /**
   * Find guides by exact name.
   * Searches using the search input, then scans guide name links.
   */
  async findByExactName(name: string): Promise<GuideRow[]> {
    const searchInput = this.page.locator(SELECTORS.catalog.guideSearchInput).first();
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill(name);
      await this.page.waitForTimeout(600); // debounce
    }

    const links = this.page.locator(SELECTORS.catalog.guideNameLink);
    const count = await links.count();
    const matches: GuideRow[] = [];

    for (let i = 0; i < count; i++) {
      const link = links.nth(i);
      const text = (await link.textContent())?.trim() ?? '';
      const href = (await link.getAttribute('href')) ?? '';

      if (text === name) {
        matches.push({ name: text, url: href });
      }
    }

    return matches;
  }

  async assertNoDuplicate(name: string, releaseId: string): Promise<void> {
    const existing = await this.findByExactName(name);

    if (existing.length === 1) {
      throw new AutomationError({
        code: ErrorCode.DUPLICATE_GUIDE,
        message: `Guide "${name}" already exists. Use --resume if this is a previous partial run.`,
        releaseId,
        resumable: true,
      });
    }

    if (existing.length > 1) {
      throw new AutomationError({
        code: ErrorCode.DUPLICATE_GUIDE,
        message: `Multiple guides named "${name}" exist. Manual investigation required.`,
        releaseId,
      });
    }
  }

  /** Navigate directly to a guide by its name (via catalog search → click) */
  async openGuideByName(name: string): Promise<string> {
    const matches = await this.findByExactName(name);

    if (matches.length === 0) {
      throw new AutomationError({
        code: ErrorCode.TEMPLATE_NOT_FOUND,
        message: `Guide "${name}" not found in catalog`,
        phase: 'verified',
      });
    }

    if (matches.length > 1) {
      throw new AutomationError({
        code: ErrorCode.DUPLICATE_GUIDE,
        message: `Multiple guides named "${name}" found`,
        phase: 'verified',
      });
    }

    const href = matches[0]!.url;
    await this.page.click(`a[href="${href}"]`);
    await this.page.waitForLoadState('domcontentloaded');
    return this.page.url();
  }
}
