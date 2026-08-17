import type { Locator, Page } from 'playwright';
import { SELECTORS } from '../selectors.js';
import { AutomationError } from '../../errors/automation-error.js';
import { ErrorCode } from '../../errors/error-codes.js';

export interface GuideDetails {
  name: string;
  status: string;
  appName: string;
  url: string;
  stepCount: number;
}

export class GuideDetailsPage {
  constructor(private readonly page: Page) {}

  async navigate(guideUrl: string): Promise<void> {
    await this.page.goto(guideUrl, { waitUntil: 'domcontentloaded' });

    // After cloning with ?redirectFromCloning=true, Pendo sometimes opens the title in
    // inline-edit mode (h1 hidden while the input is active). Other times the h1 is just
    // slow to render and there's no edit mode at all. Escape doesn't reliably dismiss the
    // edit mode, so click the confirm (checkmark) button instead — but only if it actually
    // appears, otherwise fall through to the plain wait below.
    const titleVisible = await this.page
      .locator(SELECTORS.details.guideName)
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    if (!titleVisible) {
      // Note: Locator.isVisible() checks the current state instantly and does not poll —
      // its `timeout` option does not wait for the element to appear. waitFor() does.
      const confirmButton = this.page.locator(SELECTORS.details.confirmNameEditButton).first();
      const confirmVisible = await confirmButton
        .waitFor({ state: 'visible', timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      if (confirmVisible) {
        await this.confirmNameEdit(confirmButton);
      }
    }

    await this.page.locator(SELECTORS.details.guideName).waitFor({ timeout: 15000 });
  }

  /**
   * Confirm the inline name-edit input. A normal Playwright click (mousedown → mouseup)
   * loses the race with the input's onBlur handler, which hides the confirm button before
   * mouseup lands — the click never registers even though it looks like it should. Dispatching
   * a native `click()` on the button element sidesteps the mousedown/blur sequence entirely.
   * Falls back to a real click, then Enter, in case that assumption is wrong for some state.
   *
   * Each of the 3 attempts waits up to 5000ms (15000ms total) — matching the 15000ms the
   * caller (navigate()) already treats as a normal amount of time for the h1 to re-appear.
   * A shorter per-attempt budget here previously caused a legitimately-succeeding rename
   * (just slow to re-render) to be misreported as PENDO_RENAME_FAILED.
   */
  private async confirmNameEdit(confirmButton: Locator): Promise<void> {
    const isConfirmed = () =>
      this.page
        .locator(SELECTORS.details.guideName)
        .waitFor({ timeout: 5000 })
        .then(() => true)
        .catch(() => false);

    await confirmButton.evaluate((el: { click(): void }) => el.click()).catch(() => {});
    if (await isConfirmed()) return;

    await confirmButton.click({ force: true }).catch(() => {});
    if (await isConfirmed()) return;

    await this.page.keyboard.press('Enter').catch(() => {});
    if (await isConfirmed()) return;

    throw new AutomationError({
      code: ErrorCode.PENDO_RENAME_FAILED,
      message: 'Could not confirm the guide name after cloning — inline-edit mode stayed open after clicking the checkmark button, a forced click, and Enter.',
      phase: 'cloned',
    });
  }

  async getDetails(): Promise<GuideDetails> {
    const name = (await this.page.locator(SELECTORS.details.guideName).textContent())?.trim() ?? '';

    const statusEl = this.page.locator(SELECTORS.details.guideStatusDropdown);
    const status = (await statusEl.textContent())?.trim() ?? '';

    const appEl = this.page.locator(SELECTORS.details.activeAppName);
    const appName = (await appEl.textContent())?.trim() ?? '';

    // Step count stored as attribute on the first step-preview element. Check count() first —
    // getAttribute() on a zero-match locator auto-waits the full default timeout (~30s)
    // before rejecting, instead of failing fast.
    const previews = this.page.locator(SELECTORS.details.stepPreview);
    const stepCountAttr = (await previews.count()) > 0
      ? await previews.first().getAttribute('step-count').catch(() => '0')
      : '0';
    const stepCount = parseInt(stepCountAttr ?? '0', 10);

    return { name, status, appName, url: this.page.url(), stepCount };
  }

  async assertDraft(releaseId: string): Promise<void> {
    const { status, name } = await this.getDetails();
    if (status.toLowerCase() === 'public') {
      throw new AutomationError({
        code: ErrorCode.PENDO_GUIDE_PUBLISHED,
        message: `Guide "${name}" is Public — automation must stop immediately.`,
        releaseId,
        phase: 'verified',
      });
    }
    if (!status.toLowerCase().includes('draft')) {
      throw new AutomationError({
        code: ErrorCode.VERIFICATION_FAILED,
        message: `Guide "${name}" has unexpected status: "${status}". Expected Draft.`,
        releaseId,
      });
    }
  }

  /**
   * Clone the current guide with a new name.
   * The clone dialog allows setting the name and choosing the same app.
   * After cloning, Pendo navigates to the new guide's details page.
   *
   * @returns URL of the cloned guide's details page
   */
  async cloneWithName(newName: string): Promise<string> {
    // Open the more options dropdown
    await this.page.locator(SELECTORS.details.moreOptionsButton).click();

    // Click "Clone guide" from the dropdown
    const cloneOption = this.page.locator(SELECTORS.details.cloneOption);
    await cloneOption.waitFor({ timeout: 5000 });
    await cloneOption.click();

    // Wait for clone dialog to appear
    const newNameInput = this.page.locator(SELECTORS.clone.newNameInput);
    await newNameInput.waitFor({ timeout: 10000 });

    // Set the new guide name
    await newNameInput.click({ clickCount: 3 });
    await newNameInput.fill(newName);

    // Confirm clone (app selector already defaults to current app)
    await this.page.locator(SELECTORS.clone.confirmButton).click();

    // Wait for navigation to the cloned guide
    const currentUrl = this.page.url();
    await this.page.waitForURL(
      (url) => url.toString().includes('/guides/') && url.toString() !== currentUrl,
      { timeout: 30000 },
    );

    const clonedUrl = this.page.url();
    if (!clonedUrl || clonedUrl === currentUrl) {
      throw new AutomationError({
        code: ErrorCode.PENDO_CLONE_FAILED,
        message: 'Clone did not navigate to a new guide URL',
        phase: 'cloned',
      });
    }

    return clonedUrl;
  }

  /**
   * Open the Guide Editor (Edit in Pendo) — opens in same tab.
   * Handles intermediate SSO/auth redirects that Pendo may trigger before
   * the guide editor URL is reached.
   */
  async openGuideEditor(): Promise<void> {
    const isEditorOrSsoUrl = (url: URL | string): boolean => {
      const u = url.toString();
      return (
        SELECTORS.editor.urlPattern.test(u) ||
        u.includes('auth0.com') ||
        u.includes('/login') ||
        u.includes('/signin') ||
        u.includes('/sso')
      );
    };

    await this.page.locator(SELECTORS.details.editInPendoButton).click();

    // Wait for URL to land on guide editor OR an SSO/auth page
    await this.page.waitForURL(isEditorOrSsoUrl, { timeout: 30000 });

    const currentUrl = this.page.url();

    // If landed on SSO/auth page, navigate back to guide and retry once
    if (!SELECTORS.editor.urlPattern.test(currentUrl)) {
      // SSO page appeared — navigate back and wait for it to resolve
      await this.page.goBack();
      await this.page.locator(SELECTORS.details.guideName).waitFor({ timeout: 15000 });
      // Retry opening the editor. Watch for the same broad SSO/auth set as the first
      // attempt — a flaky session can redirect to SSO again, and waiting on the editor
      // URL pattern alone would produce an unclear raw timeout instead of a chance to
      // detect and report the repeated SSO redirect.
      await this.page.locator(SELECTORS.details.editInPendoButton).click();
      await this.page.waitForURL(isEditorOrSsoUrl, { timeout: 45000 });

      if (!SELECTORS.editor.urlPattern.test(this.page.url())) {
        throw new AutomationError({
          code: ErrorCode.PENDO_UNEXPECTED_STATE,
          message: `Guide Editor redirected to SSO/auth a second time: ${this.page.url()}. The Pendo session may need re-authentication (run pendo:auth).`,
          phase: 'cloned',
        });
      }
    }

    // Wait for the save button to appear (editor fully loaded)
    await this.page.locator(SELECTORS.editor.saveButton).waitFor({ timeout: 15000 });
  }
}
