/**
 * Describes invariants of the Pendo UI that the automation depends on.
 * Deviation from these values is a contract failure → stop the run.
 *
 * Confirmed during technical spike on 2026-08-17.
 * Template URL: https://app.pendo.io/s/5718259445137408/guides/YkmddvmB8yfvbst5ihfgEsZuZrQ
 */
export const UI_CONTRACT = {
  /** Exact name of the template guide in Pendo */
  TEMPLATE_NAME: 'Release Notes Template',
  TEMPLATE_STATUS: 'Draft',
  /**
   * Number of steps the template must have before automation begins.
   * Template was extended on 2026-08-17 to add dedicated Master Image and
   * Master Video steps (previously 3: Intro, Master Feature, Outro).
   */
  TEMPLATE_STEP_COUNT: 5,

  /**
   * Logical step positions within the template (0-based, matches
   * stepPreviewContainer order). Each master step is duplicated or deleted
   * depending on how many manifest features need that media type — see
   * StepListComponent.shapeFeatureSteps.
   */
  STEP_ORDER: {
    INTRO_INDEX: 0,
    /** Master Feature step (text-only) — duplicated/deleted based on features with media.type "none" */
    MASTER_FEATURE_INDEX: 1,
    /** Master Image step — duplicated/deleted based on features with media.type "image" */
    MASTER_IMAGE_INDEX: 2,
    /** Master Video step — duplicated/deleted based on features with media.type "video" */
    MASTER_VIDEO_INDEX: 3,
    OUTRO_RELATIVE_TO_END: 0,
  },

  /**
   * Placeholder text in the template steps — used for fingerprint verification.
   * These are the actual template placeholders as observed in the UI.
   */
  TEMPLATE_CONTENT: {
    INTRO_TITLE: 'Welcome to Conversation Analytics!',
    INTRO_BODY: 'Here what changed for the last release:',
    FEATURE_TITLE: 'Feature Title',
    FEATURE_BODY: 'Feature Description.',
    OUTRO_TITLE: "You're all set!",
    OUTRO_BODY: "You've seen the main changes. Start exploring Conversational Analytics and come back anytime you need help.",
  },
} as const;
