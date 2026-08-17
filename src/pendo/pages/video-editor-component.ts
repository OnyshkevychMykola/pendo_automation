import type { Page } from 'playwright';
import { SELECTORS } from '../selectors.js';
import { textMatches } from '../../util/text.js';
import { AutomationError } from '../../errors/automation-error.js';
import { ErrorCode } from '../../errors/error-codes.js';

/**
 * Handles video block editing in the Pendo Guide Editor ("Edit in Pendo").
 *
 * Assumes the target video block is already open (StepListComponent.openVideoBlock was
 * called). The master video step's provider is preset to Loom in the template, so this
 * only needs to set the URL (and optional title) — both plain text fields.
 */
export class VideoEditorComponent {
  constructor(private readonly page: Page) {}

  async setVideo(url: string, title?: string): Promise<void> {
    const urlInput = this.page.locator(SELECTORS.editor.videoUrlInput);
    await urlInput.click({ clickCount: 3 });
    await urlInput.fill(url);
    await urlInput.press('Tab');

    const readback = await urlInput.inputValue();
    if (!textMatches(readback, url)) {
      throw new AutomationError({
        code: ErrorCode.PENDO_TEXT_READBACK_MISMATCH,
        message: `Video URL readback mismatch. Expected "${url}", got "${readback}"`,
        phase: 'media-populated',
        details: { expected: url, actual: readback },
      });
    }

    if (title) {
      const titleInput = this.page.locator(SELECTORS.editor.videoTitleInput);
      await titleInput.fill(title);
      await titleInput.press('Tab');
    }
  }
}
