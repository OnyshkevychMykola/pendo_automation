import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { ensureDir, timestampedDir } from '../util/paths.js';
import { writeJsonAtomic } from '../util/atomic-file.js';
import type { Logger } from './logger.js';

export class ArtifactManager {
  readonly runDir: string;
  readonly screenshotsDir: string;
  readonly tracesDir: string;
  private screenshotCounter = 0;

  constructor(
    artifactsRoot: string,
    releaseId: string,
    private readonly logger: Logger,
  ) {
    this.runDir = timestampedDir(artifactsRoot, releaseId);
    this.screenshotsDir = path.join(this.runDir, 'screenshots');
    this.tracesDir = path.join(this.runDir, 'traces');
    ensureDir(this.screenshotsDir);
    ensureDir(this.tracesDir);
  }

  async screenshot(page: Page, label: string): Promise<string> {
    this.screenshotCounter++;
    const seq = String(this.screenshotCounter).padStart(3, '0');
    const name = `${seq}-${label.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}.png`;
    const filePath = path.join(this.screenshotsDir, name);
    await page.screenshot({ path: filePath, fullPage: false });
    this.logger.debug({ screenshot: filePath }, `Screenshot: ${label}`);
    return filePath;
  }

  async screenshotAllPages(pages: Page[], label: string): Promise<void> {
    for (const page of pages) {
      try {
        await this.screenshot(page, label);
      } catch { /* ignore individual failures during error capture */ }
    }
  }

  writeSnapshot(name: string, data: unknown): void {
    const filePath = path.join(this.runDir, name);
    writeJsonAtomic(filePath, data);
  }

  writeMarkdown(name: string, content: string): void {
    fs.writeFileSync(path.join(this.runDir, name), content, 'utf8');
  }

  tracePath(name = 'trace.zip'): string {
    return path.join(this.tracesDir, name);
  }
}
