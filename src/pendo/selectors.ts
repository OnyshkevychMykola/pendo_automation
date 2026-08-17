/**
 * All Pendo-specific selectors centralized here.
 * Confirmed during technical spike on 2026-08-17.
 *
 * Priority order (most to least stable):
 *   1. data-cy attributes (Pendo's own test IDs)
 *   2. aria-label / role attributes
 *   3. Stable CSS class names (pendo-* prefixed)
 *   4. Visible text (scoped to known container)
 *
 * NEVER use: generated class names, nth-child, coordinates, broad text matches.
 */

export const SELECTORS = {
  // ── Authentication ──────────────────────────────────────────────────────
  auth: {
    /** Stable element visible only in an authenticated Pendo app shell */
    authShell: '[data-cy="top-nav"]',
    /** Pendo login redirect patterns */
    loginUrlPattern: /app\.pendo\.io\/login|auth0\.com\/u\/login/,
  },

  // ── Guide catalog page ───────────────────────────────────────────────────
  catalog: {
    /** Main guide management table wrapper */
    guidesTable: '[data-cy="management-table"]',
    /** Search input in catalog */
    guideSearchInput: 'input.pendo-search[placeholder="Search"]',
    /** Individual guide rows — each <tr> has id = guideId */
    guideRow: 'tr.pendo-table__row[role="row"]',
    /** Guide name link inside a row (links to guide details) */
    guideNameLink: 'a[href*="/guides/"]',
    /** Status badge inside a guide row */
    guideStatusBadge: '[data-cy="segment-everyone"]',
    /** App/page name inside a guide row */
    guidePageName: '[data-cy="page-name"]',
  },

  // ── Guide details page ───────────────────────────────────────────────────
  details: {
    /** Guide name heading (h1) */
    guideName: 'h1.pendo-page-header__title',
    /** Editable guide name button (click to rename) */
    guideNameButton: 'div[role="button"][aria-label^="Guide name:"].pendo-editable-content__slot',
    /**
     * Confirm (checkmark) button that appears next to the guide name when it's
     * in inline-edit mode (e.g. right after cloning, via ?redirectFromCloning=true).
     * A cancel ("x") button also renders alongside it — do not confuse the two.
     */
    confirmNameEditButton: 'button[aria-label="editableContent.Confirm_edit"]',
    /** Guide status dropdown trigger ("Draft", "Public", etc.) */
    guideStatusDropdown: '[data-cy="draft-status-dropdown"]',
    /** "..." more options button (contains Clone, Permalinks, etc.) */
    moreOptionsButton: '[data-cy="guide-more-button"]',
    /** "Clone guide" option in the more options dropdown */
    cloneOption: '[role="option"][aria-label="Clone guide"]',
    /** Delete guide action button */
    deleteButton: '[data-cy="guide-delete-action"]',
    /** "Edit in Pendo" button — opens Guide Editor in same tab */
    editInPendoButton: '[data-cy="content-card-edit-in-pendo"]',
    /** "Edit in my app" button — triggers Launch Designer flow (new tab) */
    editInAppButton: '[data-cy="content-card-edit-in-app"]',
    /** "Launch Designer" button (appears after clicking editInAppButton) */
    launchDesignerButton: '[data-cy="launch-designer-button"]',
    /** Step preview thumbnails — each has step-count attr on first */
    stepPreview: '[data-cy="step-preview"]',
    /** App name shown in guide subtitle */
    activeAppName: '[data-cy="guide-details-subtitle-active-app"]',
    /** Step tabs for navigating (Page 1, Page 2, …) */
    stepTab: 'button[role="tab"].pendo-tabs-nav__tab',
  },

  // ── Clone dialog ─────────────────────────────────────────────────────────
  clone: {
    /** Clone Guide dialog container */
    dialog: 'div[role="dialog"].pendo-modal',
    /** "New guide name" text input inside clone dialog */
    newNameInput: 'input[aria-label="New guide name"]',
    /** App selector combobox inside clone dialog */
    appSelector: 'div.pendo-multiselect__trigger',
    /** Confirm clone button */
    confirmButton: '[data-cy="cloneGuide"]',
    /** Cancel button */
    cancelButton: 'button.pendo-button--secondary:has-text("Cancel")',
  },

  // ── New Guide Editor (Edit in Pendo — same tab) ──────────────────────────
  editor: {
    /** URL path pattern for the Guide Editor */
    urlPattern: /\/guides\/guide-editor\//,
    /** Save guide button */
    saveButton: 'button:has-text("Save guide")',
    /** Close / back button (returns to guide details) */
    closeButton: '[data-cy="back-button"]',
    /** Chat mode toggle */
    chatToggle: 'button[aria-label="Chat"]',
    /** Inspect mode toggle */
    inspectToggle: 'button[aria-label="Inspect"]',
    /** "Guide steps preview" region */
    stepsPreviewRegion: '[role="region"][name="Guide steps preview"]',
    /**
     * Edit text block elements — one per text block within a step. Scope this to a single
     * step's stepPreviewContainer before indexing (title = nth(0), body = nth(1)); a global
     * flat index across all steps is unreliable since block count per step isn't uniform.
     * These are `div[role="button"]` elements, NOT `<button>` — confirmed via live DOM
     * inspection on 2026-08-17 (the "technical spike" note above this file was wrong).
     */
    editTextBlockButton: '[role="button"].bb-text._pendo-text-custom[aria-label="Edit text block"]',
    /** CodeMirror contenteditable div (active when a text block is in edit mode) */
    activeTextEditor: 'div.cm-content[contenteditable="true"]',
    /**
     * Edit image/video block elements — like editTextBlockButton, scope to a single step's
     * stepPreviewContainer before use. Confirmed via live DOM inspection on 2026-08-17.
     */
    editImageBlockButton: '[role="button"][aria-label="Edit image block"]',
    editVideoBlockButton: '[role="button"][aria-label="Edit video block"]',
    /** Hidden file input for image upload — usable via Locator.setInputFiles() */
    imageFileInput: 'input.pendo-image-upload__file-input[type="file"]',
    /** "Image URL" text field in the image block's edit panel */
    imageUrlInput: 'input[placeholder="Enter Image URL"]',
    /** "Image Alt Text" field in the image block's edit panel */
    imageAltInput: 'input.image-block-inspect-settings__input',
    /** "Video URL" text field in the video block's edit panel */
    videoUrlInput: 'input[placeholder="Enter Video URL"]',
    /** "Video Title" text field in the video block's edit panel */
    videoTitleInput: 'input[placeholder="Enter a Video Title"]',
    /** "Add step N" buttons between steps */
    addStepButton: 'button.add-step-btn[aria-label^="Add step"]',
    /** Step close/delete button (× on each step card) */
    stepCloseButton: 'button._pendo-close-guide[aria-label="Close"]',
    /** Theme selector combobox */
    themeSelector: 'button[aria-label="Theme"]',
    /** Step preview containers — one per step, 0-indexed */
    stepPreviewContainer: 'div.guide-editable-step-preview.step-preview',
    /** "Delete step N" button — visible on hover */
    deleteStepButton: 'button[aria-label^="Delete step"]',
  },

} as const;

/** "Duplicate step N" button — visible on hover over that step. N is 1-based. */
export function duplicateStepButtonSelector(oneBasedStepNumber: number): string {
  return `button[aria-label="Duplicate step ${oneBasedStepNumber}"]`;
}

/** "Delete step N" button — visible on hover over that step. N is 1-based. */
export function deleteStepButtonSelector(oneBasedStepNumber: number): string {
  return `button[aria-label="Delete step ${oneBasedStepNumber}"]`;
}
