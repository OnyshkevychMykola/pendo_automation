import type { Page } from 'playwright';
import { GuideCatalogPage } from './pages/guide-catalog-page.js';
import { AutomationError } from '../errors/automation-error.js';
import { ErrorCode } from '../errors/error-codes.js';

export class GuideFinder {
  private readonly catalog: GuideCatalogPage;

  constructor(
    private readonly page: Page,
    private readonly baseUrl: string,
  ) {
    this.catalog = new GuideCatalogPage(page);
  }

  async findExactName(name: string): Promise<{ url: string } | null> {
    await this.catalog.navigate(this.baseUrl);
    const matches = await this.catalog.findByExactName(name);

    if (matches.length === 0) return null;
    if (matches.length === 1) return { url: matches[0]!.url };

    throw new AutomationError({
      code: ErrorCode.DUPLICATE_GUIDE,
      message: `Multiple guides found with name "${name}". Manual investigation required.`,
    });
  }

  async assertNoDuplicate(name: string, releaseId: string): Promise<void> {
    await this.catalog.navigate(this.baseUrl);
    await this.catalog.assertNoDuplicate(name, releaseId);
  }
}
