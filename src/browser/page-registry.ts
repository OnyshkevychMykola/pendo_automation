import type { BrowserContext, Page } from 'playwright';
import type { Logger } from '../observability/logger.js';

/**
 * Tracks all open pages and identifies Pendo-specific surfaces.
 * Handles cases where Visual Design Studio opens in a new tab or popup.
 */
export class PageRegistry {
  private pages: Map<string, Page> = new Map();

  constructor(
    private readonly context: BrowserContext,
    private readonly logger: Logger,
  ) {
    context.on('page', (page) => this.register(page));
  }

  register(page: Page): void {
    const url = page.url();
    this.pages.set(url, page);
    page.on('close', () => this.pages.delete(url));
    this.logger.debug({ url }, 'Page registered');
  }

  async getOrOpenPage(baseUrl: string): Promise<Page> {
    for (const page of this.context.pages()) {
      if (page.url().startsWith(baseUrl)) return page;
    }
    const page = await this.context.newPage();
    this.register(page);
    return page;
  }

  async waitForPageMatchingUrl(urlPattern: string | RegExp, timeoutMs = 15000): Promise<Page> {
    const existing = this.context.pages().find((p) =>
      typeof urlPattern === 'string' ? p.url().includes(urlPattern) : urlPattern.test(p.url()),
    );
    if (existing) return existing;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout waiting for page: ${urlPattern}`)), timeoutMs);

      const handler = (page: Page) => {
        const check = (): void => {
          const url = page.url();
          const matches = typeof urlPattern === 'string' ? url.includes(urlPattern) : urlPattern.test(url);
          if (matches) {
            clearTimeout(timer);
            this.context.off('page', handler);
            resolve(page);
          }
        };
        page.on('load', check);
        check();
      };

      this.context.on('page', handler);
    });
  }

  allPages(): Page[] {
    return this.context.pages();
  }
}
