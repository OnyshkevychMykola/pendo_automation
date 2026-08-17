import type { Locator, Page } from 'playwright';
import { SELECTORS, duplicateStepButtonSelector, deleteStepButtonSelector } from '../selectors.js';
import { UI_CONTRACT } from '../ui-contract.js';
import { AutomationError } from '../../errors/automation-error.js';
import { ErrorCode } from '../../errors/error-codes.js';
import type { ReleaseManifest } from '../../manifest/manifest-schema.js';

export interface ShapedStep {
  /** 0-based index into stepPreviewContainer for the final, shaped step list */
  stepIndex: number;
  feature: ReleaseManifest['features'][number];
}

/**
 * Given the manifest's features, compute which final step index each feature will land on
 * after shapeFeatureSteps() runs. Pure function — safe to call on resume without touching
 * the page, since the resulting layout is a deterministic function of the manifest.
 *
 * shapeFeatureSteps() always produces steps grouped by media type, in this fixed order:
 * Intro, [text-only features], [image features], [video features], Outro — regardless of
 * the order features appear in the manifest. Exact manifest-order interleaving across
 * different media types is not supported (see shapeFeatureSteps for why).
 */
export function computeStepMapping(features: ReleaseManifest['features']): ShapedStep[] {
  const order: ReleaseManifest['features'][number]['media']['type'][] = ['none', 'image', 'video'];
  const mapping: ShapedStep[] = [];
  let stepIndex = 1; // 0 = Intro
  for (const mediaType of order) {
    for (const feature of features) {
      if (feature.media.type === mediaType) {
        mapping.push({ stepIndex, feature });
        stepIndex++;
      }
    }
  }
  return mapping;
}

/**
 * Manages step-level operations in the new Pendo Guide Editor.
 *
 * Each step has 2 text blocks (title + body) accessed by global index:
 *   step N → title button at (N*2), body button at (N*2+1).
 *
 * Step shape strategy: the template has one master step per media type (text-only,
 * image, video — see UI_CONTRACT.STEP_ORDER). For each type, shapeFeatureSteps()
 * duplicates that type's master step (N-1) times for N features needing that type, or
 * deletes the master entirely if no feature needs it. This preserves each master step's
 * layout/styling without triggering the "Add New Step" block-type picker (which we found
 * too fragile to automate reliably — see session notes from 2026-08-17).
 */
export class StepListComponent {
  constructor(private readonly page: Page) {}

  /**
   * Count steps by counting "Add step N" buttons — one button per step.
   */
  async getStepCount(): Promise<number> {
    const addButtons = this.page.locator(SELECTORS.editor.addStepButton);
    const count = await addButtons.count();
    if (count > 0) return count;

    // Fallback: edit-text-block buttons ÷ 2 (2 per step)
    const textButtons = this.page.locator(SELECTORS.editor.editTextBlockButton);
    return Math.ceil(await textButtons.count() / 2);
  }

  /**
   * Text block buttons for a given step (0-indexed), scoped to that step's own preview
   * container. A global flat index across all steps (stepIndex * 2) is unreliable — the
   * number of editable text blocks per step isn't guaranteed uniform (confirmed via live
   * DOM inspection on 2026-08-17: it caused writes to land on the wrong step entirely).
   * Within a single step's container, the first text block is the title, the second is the
   * body — this holds even for image/video steps, since editTextBlockButton only matches
   * text blocks and skips over the image/video block that precedes them in the DOM.
   */
  private stepTextButtons(stepIndex: number) {
    return this.page
      .locator(SELECTORS.editor.stepPreviewContainer)
      .nth(stepIndex)
      .locator(SELECTORS.editor.editTextBlockButton);
  }

  /**
   * Open the title text block for a given step (0-indexed) in edit mode.
   * Returns the block's permanent wrapper element (stable across edit/display mode) — use
   * this, not the transient CodeMirror editor, to read back the saved text afterwards.
   *
   * Note: the CodeMirror editor from a previously-edited block can linger in the DOM for a
   * moment after being blurred (confirmed via live testing on 2026-08-17), so
   * `activeTextEditor` can transiently match more than one element. `.last()` picks the one
   * that was just opened, since new editors are appended after any stale one.
   */
  async openTitleBlock(stepIndex: number): Promise<Locator> {
    const block = this.stepTextButtons(stepIndex).nth(0);
    await block.click();
    await this.page.locator(SELECTORS.editor.activeTextEditor).last().waitFor({ timeout: 5000 });
    return block;
  }

  /**
   * Open the body text block for a given step (0-indexed) in edit mode.
   * Returns the block's permanent wrapper element — see openTitleBlock for why.
   */
  async openBodyBlock(stepIndex: number): Promise<Locator> {
    const block = this.stepTextButtons(stepIndex).nth(1);
    await block.click();
    await this.page.locator(SELECTORS.editor.activeTextEditor).last().waitFor({ timeout: 5000 });
    return block;
  }

  /**
   * Open the image block for a given step (0-indexed) in edit mode.
   * Waits for the "Enter Image URL" field to appear, confirming the edit panel is open.
   */
  async openImageBlock(stepIndex: number): Promise<void> {
    const block = this.page
      .locator(SELECTORS.editor.stepPreviewContainer)
      .nth(stepIndex)
      .locator(SELECTORS.editor.editImageBlockButton)
      .first();
    await block.click();
    await this.page.locator(SELECTORS.editor.imageUrlInput).waitFor({ timeout: 5000 });
  }

  /**
   * Open the video block for a given step (0-indexed) in edit mode.
   * Waits for the "Enter Video URL" field to appear, confirming the edit panel is open.
   */
  async openVideoBlock(stepIndex: number): Promise<void> {
    const block = this.page
      .locator(SELECTORS.editor.stepPreviewContainer)
      .nth(stepIndex)
      .locator(SELECTORS.editor.editVideoBlockButton)
      .first();
    await block.click();
    await this.page.locator(SELECTORS.editor.videoUrlInput).waitFor({ timeout: 5000 });
  }

  /**
   * Duplicate a step by its current 1-based position. The duplicate appears immediately
   * after that step, pushing all subsequent steps down. To reveal the toolbar, the step
   * preview must be hovered first.
   */
  async duplicateStep(oneBasedStepNumber: number): Promise<void> {
    const countBefore = await this.getStepCount();

    const stepPreviews = this.page.locator(SELECTORS.editor.stepPreviewContainer);
    await stepPreviews.nth(oneBasedStepNumber - 1).hover();

    const duplicateButton = this.page.locator(duplicateStepButtonSelector(oneBasedStepNumber));
    await duplicateButton.waitFor({ state: 'visible', timeout: 3000 });
    await duplicateButton.click();

    await this.waitForStepCount(countBefore + 1, ErrorCode.PENDO_DUPLICATE_STEP_FAILED,
      `Expected ${countBefore + 1} steps after duplicating step ${oneBasedStepNumber}`);
  }

  /**
   * Delete a step by its current 1-based position. Used to remove a master step (image or
   * video) entirely when no manifest feature needs that media type.
   */
  async deleteStep(oneBasedStepNumber: number): Promise<void> {
    const countBefore = await this.getStepCount();

    const stepPreviews = this.page.locator(SELECTORS.editor.stepPreviewContainer);
    await stepPreviews.nth(oneBasedStepNumber - 1).hover();

    const deleteButton = this.page.locator(deleteStepButtonSelector(oneBasedStepNumber));
    await deleteButton.waitFor({ state: 'visible', timeout: 3000 });
    await deleteButton.click();

    await this.waitForStepCount(countBefore - 1, ErrorCode.PENDO_STEP_COUNT_MISMATCH,
      `Expected ${countBefore - 1} steps after deleting step ${oneBasedStepNumber}`);
  }

  private async waitForStepCount(expected: number, errorCode: ErrorCode, message: string): Promise<void> {
    const deadline = Date.now() + 10000;
    let counted = await this.getStepCount();
    while (counted !== expected && Date.now() < deadline) {
      await this.page.waitForTimeout(200);
      counted = await this.getStepCount();
    }

    if (counted !== expected) {
      throw new AutomationError({
        code: errorCode,
        message: `${message}, but got ${counted}`,
        phase: 'steps-shaped',
        details: { expected, actual: counted },
      });
    }
  }

  async assertStepCount(expected: number, releaseId: string): Promise<void> {
    const actual = await this.getStepCount();
    if (actual !== expected) {
      throw new AutomationError({
        code: ErrorCode.PENDO_STEP_COUNT_MISMATCH,
        message: `Expected ${expected} steps but found ${actual}`,
        phase: 'steps-shaped',
        releaseId,
        details: { expected, actual },
      });
    }
  }

  /**
   * Shape the template's steps to match the manifest's features. The template has one
   * master step per media type (text-only, image, video). For each type, duplicate its
   * master (N-1) times for N features needing that type, or delete the master if none do.
   *
   * Master steps are processed from highest original position to lowest (video, then
   * image, then text) so that duplicating/deleting one master never shifts the position of
   * a master not yet processed. The resulting step order is always grouped by type — see
   * computeStepMapping for the exact resulting layout and its limitations.
   *
   * Callers are expected to verify the result via assertStepCount() with the real release
   * ID (see release-orchestrator.ts) — this method doesn't self-check, so a mismatch is
   * reported with proper traceability instead of a duplicate check with an empty releaseId.
   */
  async shapeFeatureSteps(features: ReleaseManifest['features']): Promise<void> {
    const { MASTER_FEATURE_INDEX, MASTER_IMAGE_INDEX, MASTER_VIDEO_INDEX } = UI_CONTRACT.STEP_ORDER;

    const countByType = (type: ReleaseManifest['features'][number]['media']['type']) =>
      features.filter((f) => f.media.type === type).length;

    // 1-based step numbers, matching "Duplicate step N" / "Delete step N" aria-labels.
    await this.shapeMasterStep(MASTER_VIDEO_INDEX + 1, countByType('video'));
    await this.shapeMasterStep(MASTER_IMAGE_INDEX + 1, countByType('image'));
    await this.shapeMasterStep(MASTER_FEATURE_INDEX + 1, countByType('none'));
  }

  private async shapeMasterStep(oneBasedStepNumber: number, neededCount: number): Promise<void> {
    if (neededCount === 0) {
      await this.deleteStep(oneBasedStepNumber);
      return;
    }
    for (let i = 0; i < neededCount - 1; i++) {
      await this.duplicateStep(oneBasedStepNumber);
    }
  }
}
