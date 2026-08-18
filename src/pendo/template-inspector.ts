import type { Page } from 'playwright';
import { SELECTORS } from './selectors.js';
import { UI_CONTRACT } from './ui-contract.js';
import { GuideDetailsPage } from './pages/guide-details-page.js';
import { AutomationError } from '../errors/automation-error.js';
import { ErrorCode } from '../errors/error-codes.js';
import type { ResolvedConfig } from '../config/resolved-config.js';
import type { Logger } from '../observability/logger.js';

export interface TemplateFingerprintResult {
  name: string;
  status: string;
  appName: string;
  stepCount: number;
  url: string;
  valid: boolean;
  issues: string[];
}

export class TemplateInspector {
  private readonly detailsPage: GuideDetailsPage;

  constructor(
    private readonly page: Page,
    private readonly config: ResolvedConfig,
    private readonly logger: Logger,
  ) {
    this.detailsPage = new GuideDetailsPage(page);
  }

  async resolveTemplateUrl(): Promise<string> {
    if (this.config.templateGuideUrl) {
      return this.config.templateGuideUrl;
    }
    throw new AutomationError({
      code: ErrorCode.TEMPLATE_NOT_FOUND,
      message: 'templateGuideUrl not configured. Set it in pendo-automation.config.json.',
    });
  }

  /**
   * Verify template fingerprint before cloning (read-only).
   * Checks name, status, step count, and template content placeholders.
   */
  async verifyFingerprint(templateUrl: string): Promise<TemplateFingerprintResult> {
    await this.page.goto(templateUrl, { waitUntil: 'domcontentloaded' });
    await this.page.locator(SELECTORS.details.guideName).waitFor({ timeout: 15000 });
    // The step-preview carousel renders asynchronously after the page header (separate data
    // fetch) — without this wait, getDetails() can run while it's still empty and read
    // stepCount as 0 even though the template genuinely has steps.
    await this.page.locator(SELECTORS.details.stepPreview).first().waitFor({ timeout: 15000 }).catch(() => {});

    const { name, status, appName, stepCount } = await this.detailsPage.getDetails();

    const issues: string[] = [];

    if (name !== UI_CONTRACT.TEMPLATE_NAME) {
      issues.push(`Name mismatch: got "${name}", expected "${UI_CONTRACT.TEMPLATE_NAME}"`);
    }
    if (!status.toLowerCase().includes('draft')) {
      issues.push(`Template must be Draft, got: "${status}"`);
    }
    if (stepCount !== UI_CONTRACT.TEMPLATE_STEP_COUNT) {
      issues.push(`Template must have ${UI_CONTRACT.TEMPLATE_STEP_COUNT} steps, got: ${stepCount}`);
    }

    // Verify step placeholder text is present via step preview content
    const previewCount = await this.page.locator(SELECTORS.details.stepPreview).count();
    if (previewCount >= 2) {
      // Check step 2 (feature step) has expected placeholder text
      const featureStepText = await this.page.locator(SELECTORS.details.stepPreview).nth(1).textContent() ?? '';
      if (!featureStepText.includes(UI_CONTRACT.TEMPLATE_CONTENT.FEATURE_TITLE)) {
        issues.push(`Feature step placeholder not found. Expected "${UI_CONTRACT.TEMPLATE_CONTENT.FEATURE_TITLE}" in step 2.`);
      }
    }

    this.logger.debug({ name, status, appName, stepCount, issues }, 'Template fingerprint checked');

    if (issues.length > 0) {
      throw new AutomationError({
        code: ErrorCode.TEMPLATE_FINGERPRINT_MISMATCH,
        message: `Template fingerprint failed:\n${issues.map((i) => `  - ${i}`).join('\n')}`,
        details: { issues },
      });
    }

    return { name, status, appName, stepCount, url: templateUrl, valid: true, issues: [] };
  }

  async assertTemplateNotModified(templateUrl: string): Promise<void> {
    await this.page.goto(templateUrl, { waitUntil: 'domcontentloaded' });
    const name = (await this.page.locator(SELECTORS.details.guideName).textContent())?.trim() ?? '';
    const statusEl = this.page.locator(SELECTORS.details.guideStatusDropdown);
    const status = (await statusEl.textContent())?.trim() ?? '';

    if (name !== UI_CONTRACT.TEMPLATE_NAME || !status.toLowerCase().includes('draft')) {
      throw new AutomationError({
        code: ErrorCode.TEMPLATE_FINGERPRINT_MISMATCH,
        message: `Template state changed before cloning. Name: "${name}", Status: "${status}"`,
      });
    }
  }
}
