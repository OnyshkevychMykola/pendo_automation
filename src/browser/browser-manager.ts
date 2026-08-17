import { chromium, type BrowserContext, type Page } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { getProfileDir } from './profile-paths.js';
import { acquireProfileLock } from '../state/run-lock.js';
import { PageRegistry } from './page-registry.js';
import type { ResolvedConfig } from '../config/resolved-config.js';
import type { Logger } from '../observability/logger.js';

export class BrowserManager {
  private context: BrowserContext | null = null;
  private registry: PageRegistry | null = null;
  private profileLockRelease: (() => Promise<void>) | null = null;
  private readonly profileDir: string;

  constructor(
    private readonly config: ResolvedConfig,
    private readonly logger: Logger,
    private readonly options: { slow?: boolean; keepOpen?: boolean } = {},
  ) {
    this.profileDir = getProfileDir();
  }

  async acquireProfileLock(): Promise<void> {
    this.logger.debug({ profileDir: this.profileDir }, 'Acquiring browser profile lock');
    this.profileLockRelease = await acquireProfileLock(this.profileDir);
  }

  async launch(): Promise<void> {
    fs.mkdirSync(this.profileDir, { recursive: true });

    this.logger.info({ profileDir: this.profileDir }, 'Launching browser');

    this.context = await chromium.launchPersistentContext(this.profileDir, {
      channel: this.config.browser.channel,
      headless: false,
      viewport: this.config.browser.viewport,
      slowMo: this.options.slow ? 250 : this.config.browser.slowMoMs,
    });

    this.context.setDefaultTimeout(this.config.browser.defaultTimeoutMs);
    this.context.setDefaultNavigationTimeout(this.config.browser.navigationTimeoutMs);
    this.registry = new PageRegistry(this.context, this.logger);

    // Register existing pages
    for (const page of this.context.pages()) {
      this.registry.register(page);
    }
  }

  async startTracing(artifactPath: string): Promise<void> {
    await this.ctx().tracing.start({ screenshots: true, snapshots: true });
    this.logger.debug({ artifactPath }, 'Tracing started');
  }

  async stopTracing(savePath: string): Promise<void> {
    try {
      await this.ctx().tracing.stop({ path: savePath });
    } catch { /* ignore tracing stop failures */ }
  }

  async getActivePage(baseUrl?: string): Promise<Page> {
    if (baseUrl) {
      return this.pages().getOrOpenPage(baseUrl);
    }
    const all = this.context?.pages() ?? [];
    return all[all.length - 1] ?? (await this.ctx().newPage());
  }

  pages(): PageRegistry {
    if (!this.registry) throw new Error('Browser not launched');
    return this.registry;
  }

  ctx(): BrowserContext {
    if (!this.context) throw new Error('Browser not launched');
    return this.context;
  }

  async navigateTo(url: string): Promise<Page> {
    const page = await this.getActivePage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    return page;
  }

  async close(): Promise<void> {
    if (this.options.keepOpen) {
      this.logger.info('Keeping browser open (--keep-browser-open)');
      // Wait until browser is closed manually
      if (this.context) {
        await this.context.waitForEvent('close').catch(() => {});
      }
      return;
    }
    try {
      await this.context?.close();
    } catch { /* ignore close errors */ }
  }

  async releaseProfileLock(): Promise<void> {
    try {
      await this.profileLockRelease?.();
    } catch { /* ignore */ }
  }

  get profilePath(): string {
    return path.resolve(this.profileDir);
  }
}
