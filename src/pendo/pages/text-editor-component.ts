import type { Locator, Page } from 'playwright';
import { SELECTORS } from '../selectors.js';
import { textMatches } from '../../util/text.js';
import { AutomationError } from '../../errors/automation-error.js';
import { ErrorCode } from '../../errors/error-codes.js';

/**
 * Handles text editing in the new Pendo Guide Editor.
 *
 * The editor uses CodeMirror — the active editable is div.cm-content[contenteditable="true"].
 * To edit: click "Edit text block" button → select-all → type new text.
 */
export class TextEditorComponent {
  constructor(private readonly page: Page) {}

  /**
   * Replace text in the currently active CodeMirror editor.
   * Assumes the editor is already in edit mode (text block button clicked).
   *
   * `block` is the text block's permanent wrapper (returned by StepListComponent's
   * openTitleBlock/openBodyBlock) — read the confirmed text back from it, not from the
   * CodeMirror editor. CodeMirror can unmount immediately after blur (confirmed via live
   * testing on 2026-08-17: reading it back right after pressing Tab intermittently hung
   * waiting for an editor that had already been torn down).
   *
   * `.last()`: a previously-edited block's CodeMirror instance can linger in the DOM briefly
   * after being blurred, so this selector can transiently match more than one editor. The
   * one just opened is always the most recently attached, i.e. last in DOM order.
   */
  async replaceActiveEditorText(newText: string, label: string, block: Locator): Promise<void> {
    const editor = this.page.locator(SELECTORS.editor.activeTextEditor).last();
    await editor.waitFor({ timeout: 5000 });

    // Select all and replace
    await editor.click();
    await editor.press('Control+a');
    await editor.fill(newText);
    // Trigger save via Tab key (blur)
    await editor.press('Tab');
    await this.page.waitForTimeout(300);

    // Read-back verification — check the text block shows updated text
    const readback = (await block.textContent())?.trim() ?? '';
    if (!textMatches(readback, newText)) {
      throw new AutomationError({
        code: ErrorCode.PENDO_TEXT_READBACK_MISMATCH,
        message: `Text readback mismatch for ${label}. Expected: "${newText.slice(0, 60)}" Got: "${readback.slice(0, 60)}"`,
        phase: 'text-populated',
        details: { expected: newText, actual: readback },
      });
    }
  }

  /**
   * Replace title text of a step. `block` is the Locator returned by steps.openTitleBlock(n).
   */
  async replaceTitle(value: string, block: Locator): Promise<void> {
    await this.replaceActiveEditorText(value, 'title', block);
  }

  /**
   * Replace body text of a step. `block` is the Locator returned by steps.openBodyBlock(n).
   */
  async replaceBody(value: string, block: Locator): Promise<void> {
    await this.replaceActiveEditorText(value, 'body', block);
  }
}
