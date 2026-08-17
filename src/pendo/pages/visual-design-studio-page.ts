import type { Page } from 'playwright';
import { SELECTORS } from '../selectors.js';
import { StepListComponent } from './step-list-component.js';
import { TextEditorComponent } from './text-editor-component.js';
import { ImageEditorComponent } from './image-editor-component.js';
import { VideoEditorComponent } from './video-editor-component.js';
import { AutomationError } from '../../errors/automation-error.js';
import { ErrorCode } from '../../errors/error-codes.js';
import type { ReleaseManifest } from '../../manifest/manifest-schema.js';

/**
 * Represents the Pendo Guide Editor (opened via "Edit in Pendo" — same tab).
 *
 * URL pattern: /guides/guide-editor/{appId}/{stepId}?guideId={guideId}
 *
 * Note: "Edit in my app" (Visual Designer) opens in a NEW tab and requires
 * product app authentication. This class uses the simpler same-tab editor.
 */
export class VisualDesignStudioPage {
  readonly steps: StepListComponent;
  readonly text: TextEditorComponent;
  readonly image: ImageEditorComponent;
  readonly video: VideoEditorComponent;

  constructor(private readonly page: Page) {
    this.steps = new StepListComponent(page);
    this.text = new TextEditorComponent(page);
    this.image = new ImageEditorComponent(page);
    this.video = new VideoEditorComponent(page);
  }

  async assertOpen(): Promise<void> {
    await this.page.locator(SELECTORS.editor.saveButton).waitFor({ timeout: 15000 });

    if (!SELECTORS.editor.urlPattern.test(this.page.url())) {
      throw new AutomationError({
        code: ErrorCode.PENDO_UNEXPECTED_STATE,
        message: `Expected Guide Editor URL but got: ${this.page.url()}`,
        phase: 'steps-shaped',
      });
    }
  }

  async populateIntro(intro: ReleaseManifest['intro']): Promise<void> {
    const INTRO_INDEX = 0;
    const titleBlock = await this.steps.openTitleBlock(INTRO_INDEX);
    await this.text.replaceTitle(intro.title, titleBlock);

    const bodyBlock = await this.steps.openBodyBlock(INTRO_INDEX);
    await this.text.replaceBody(intro.description, bodyBlock);
  }

  /**
   * Populate a single feature step. `stepIndex` is the final 0-based step position — see
   * StepListComponent.computeStepMapping for how manifest features map to step indices.
   * `resolvedImagePath` is required when feature.media.type === 'image' (pre-validated,
   * absolute path — see ValidatedManifest.imageAssets).
   */
  async populateFeature(
    stepIndex: number,
    feature: ReleaseManifest['features'][number],
    resolvedImagePath?: string,
  ): Promise<void> {
    const titleBlock = await this.steps.openTitleBlock(stepIndex);
    await this.text.replaceTitle(feature.title, titleBlock);

    const bodyBlock = await this.steps.openBodyBlock(stepIndex);
    await this.text.replaceBody(feature.description, bodyBlock);

    if (feature.media.type === 'image') {
      if (!resolvedImagePath) {
        throw new AutomationError({
          code: ErrorCode.PENDO_IMAGE_UPLOAD_FAILED,
          message: `Feature "${feature.id}" has media.type "image" but no resolved image path was provided`,
          phase: 'media-populated',
        });
      }
      await this.steps.openImageBlock(stepIndex);
      await this.image.replaceImage(resolvedImagePath, feature.media.alt);
    } else if (feature.media.type === 'video') {
      await this.steps.openVideoBlock(stepIndex);
      await this.video.setVideo(feature.media.url, feature.media.title);
    }
  }

  async populateOutro(outro: ReleaseManifest['outro'], totalSteps: number): Promise<void> {
    const outroIndex = totalSteps - 1;

    const titleBlock = await this.steps.openTitleBlock(outroIndex);
    await this.text.replaceTitle(outro.title, titleBlock);

    const bodyBlock = await this.steps.openBodyBlock(outroIndex);
    await this.text.replaceBody(outro.description, bodyBlock);
  }

  async saveAndReturn(): Promise<void> {
    await this.page.locator(SELECTORS.editor.saveButton).click();
    // After saving, navigate back to guide details
    await this.page.locator(SELECTORS.editor.closeButton).click();
    // Wait to return to guide details URL
    await this.page.waitForURL(
      (url) => !SELECTORS.editor.urlPattern.test(url.toString()),
      { timeout: 30000 },
    );
  }
}
