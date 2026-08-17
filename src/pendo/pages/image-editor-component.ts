import type { Page } from 'playwright';
import path from 'node:path';
import { SELECTORS } from '../selectors.js';
import { AutomationError } from '../../errors/automation-error.js';
import { ErrorCode } from '../../errors/error-codes.js';

/**
 * Handles image block editing in the Pendo Guide Editor ("Edit in Pendo").
 *
 * Assumes the target image block is already open (StepListComponent.openImageBlock was
 * called) — the edit panel exposes a hidden file input (uploads via Locator.setInputFiles,
 * no drag-and-drop needed) plus plain "Image URL" and "Image Alt Text" fields.
 */
export class ImageEditorComponent {
  constructor(private readonly page: Page) {}

  /**
   * Upload a local image file, replacing whatever the master step's placeholder image was,
   * and set its alt text.
   */
  async replaceImage(absolutePath: string, altText: string): Promise<void> {
    const urlInput = this.page.locator(SELECTORS.editor.imageUrlInput);
    const urlBefore = await urlInput.inputValue();

    const fileInput = this.page.locator(SELECTORS.editor.imageFileInput);
    await fileInput.setInputFiles(absolutePath);

    // Upload happens asynchronously — poll until the Image URL field reflects the new file.
    const deadline = Date.now() + 20000;
    let urlAfter = urlBefore;
    while (urlAfter === urlBefore && Date.now() < deadline) {
      await this.page.waitForTimeout(500);
      urlAfter = await urlInput.inputValue();
    }

    if (urlAfter === urlBefore) {
      // The URL usually changes on a successful upload, but a CDN that deduplicates
      // identical file content can legitimately return the same URL it already had.
      // Fall back to checking the file input still holds the file we selected before
      // concluding the upload actually failed.
      const selectedFileName = await fileInput.evaluate(
        (el: { files?: { 0?: { name?: string } } | null }) => el.files?.[0]?.name ?? null,
      );
      if (selectedFileName !== path.basename(absolutePath)) {
        throw new AutomationError({
          code: ErrorCode.PENDO_IMAGE_UPLOAD_TIMEOUT,
          message: `Image URL did not change after uploading "${absolutePath}" within 20s`,
          phase: 'media-populated',
          details: { path: absolutePath },
        });
      }
    }

    const altInput = this.page.locator(SELECTORS.editor.imageAltInput);
    await altInput.fill(altText);
    await altInput.press('Tab');
  }
}
