import type { Page } from 'playwright';
import { GuideDetailsPage } from './pages/guide-details-page.js';
import { AutomationError } from '../errors/automation-error.js';
import { ErrorCode } from '../errors/error-codes.js';
import type { ValidatedManifest } from '../manifest/manifest-validator.js';
import type { ResolvedConfig } from '../config/resolved-config.js';
import { UI_CONTRACT } from './ui-contract.js';

export class GuideVerifier {
  constructor(
    private readonly page: Page,
    private readonly config: ResolvedConfig,
  ) {}

  async verifyDraftGuide(guideUrl: string, validated: ValidatedManifest): Promise<void> {
    const details = new GuideDetailsPage(this.page);
    await details.navigate(guideUrl);
    await details.assertDraft(validated.manifest.releaseId);

    const info = await details.getDetails();

    if (info.name !== validated.generatedGuideName) {
      throw new AutomationError({
        code: ErrorCode.VERIFICATION_FAILED,
        message: `Guide name mismatch. Expected: "${validated.generatedGuideName}" Got: "${info.name}"`,
        phase: 'verified',
        releaseId: validated.manifest.releaseId,
      });
    }

    if (info.stepCount !== validated.expectedSteps) {
      throw new AutomationError({
        code: ErrorCode.VERIFICATION_FAILED,
        message: `Step count mismatch. Expected: ${validated.expectedSteps} Got: ${info.stepCount}`,
        phase: 'verified',
        releaseId: validated.manifest.releaseId,
        details: { expected: validated.expectedSteps, actual: info.stepCount },
      });
    }

    // Verify no template placeholder text remains in visible step previews
    await this.verifyNoPlaceholdersRemain(guideUrl);
  }

  private async verifyNoPlaceholdersRemain(guideUrl: string): Promise<void> {
    await this.page.goto(guideUrl, { waitUntil: 'domcontentloaded' });

    const placeholders = Object.values(UI_CONTRACT.TEMPLATE_CONTENT);
    const previewEls = this.page.locator('[data-cy="step-preview"]');
    const count = await previewEls.count();

    for (let i = 0; i < count; i++) {
      const text = (await previewEls.nth(i).textContent()) ?? '';
      for (const placeholder of placeholders) {
        if (text.includes(placeholder)) {
          throw new AutomationError({
            code: ErrorCode.VERIFICATION_FAILED,
            message: `Template placeholder "${placeholder}" still present in step ${i + 1}`,
            phase: 'verified',
          });
        }
      }
    }
  }
}
