# Troubleshooting and error taxonomy

## Error categories

Report failures using one of these categories so the user immediately understands what
class of problem occurred. These map onto (a subset of, deliberately simplified from) the
legacy tool's `src/errors/error-codes.ts`.

| Category | Meaning | Legacy equivalent(s) |
|---|---|---|
| `INPUT_ERROR` | The guide content is missing required fields, fails schema/plain-text rules, or an image asset is missing/invalid/too large/escapes its directory. | `MANIFEST_INVALID`, `ASSET_NOT_FOUND`, `ASSET_FORMAT_INVALID`, `ASSET_TOO_LARGE`, `ASSET_PATH_TRAVERSAL` |
| `CONFIG_ERROR` | `pendo-config.yaml` is missing, malformed, or the requested app/page/template key doesn't exist in it. | `CONFIG_INVALID` |
| `AUTH_ERROR` | Pendo session isn't authenticated, MFA is mid-flow, access is denied, or the guide editor redirected to SSO/login twice. | `AUTH_REQUIRED`, `AUTH_MFA_IN_PROGRESS`, `ACCESS_DENIED`, `PENDO_UNAVAILABLE` |
| `TEMPLATE_NOT_FOUND` | The configured template URL doesn't resolve to a guide, or resolves to something whose name doesn't match config. | `TEMPLATE_NOT_FOUND`, `APP_NOT_FOUND` |
| `PAGE_NOT_FOUND` | The configured target page can't be confirmed against what's shown in Pendo. | (new in this skill — legacy tool didn't verify page targeting directly) |
| `AMBIGUOUS_UI_STATE` | A control/label needed to proceed isn't uniquely identifiable on the page. | `PENDO_SELECTOR_AMBIGUOUS` |
| `UNEXPECTED_PENDO_UI` | The template's fingerprint doesn't match (name/status/step-count/placeholders), a step count doesn't match after shaping, or the visible UI otherwise doesn't match documented behavior and no safe equivalent action can be found. | `TEMPLATE_FINGERPRINT_MISMATCH`, `PENDO_STEP_COUNT_MISMATCH`, `PENDO_UNEXPECTED_STATE`, `PENDO_CLONE_FAILED`, `PENDO_DUPLICATE_STEP_FAILED` |
| `SAVE_FAILED` | A text/image/video write didn't read back as expected, the save action didn't produce the expected result, or a validated image asset became unavailable at upload time. | `PENDO_RENAME_FAILED`, `PENDO_TEXT_READBACK_MISMATCH`, `PENDO_IMAGE_UPLOAD_TIMEOUT`, `PENDO_IMAGE_UPLOAD_FAILED`, `PENDO_SAVE_FAILED` |
| `VERIFICATION_FAILED` | The guide was saved, but the post-save check (name/status/app/step count/placeholders) found a mismatch. | `VERIFICATION_FAILED`, `PENDO_GUIDE_PUBLISHED` |

For every failure, state: what was expected, what was actually observed, and what (if
anything) was already changed in Pendo before the failure was noticed — a half-shaped or
half-populated Draft guide left behind is not itself an error, but the user needs to know
it's there.

## Existing-guide handling (retired — kept for history only)

**This mechanism no longer runs.** The duplicate-name search and live-state
classification described below were removed from `pendo-workflow.md` (formerly its step
2) to save the time a full guide-catalog search cost on every run. Cloning always
produces a new guide with its own ID, so there is no real duplicate-name hazard to guard
against; if a same-named guide already exists from an earlier run, this skill now simply
clones another one without searching for it, classifying it, or asking the user to
reconcile it. The rest of this section describes the retired design for anyone tracing
history through old runs or reports — it does not describe current behavior.

The legacy tool supported `--resume`: a JSON run journal (`state/run-journal/*.json`)
tracked which phase (`cloned` → `steps-shaped` → `text-populated` → `media-populated` →
`saved` → `verified`) a run had reached, so a failed run could continue from where it left
off instead of starting over. That journal, plus its companion file-lock mechanism
(`src/state/run-lock.ts`, `src/browser/profile-paths.ts`) for preventing two processes
from touching the same release or browser profile concurrently, is process-oriented
infrastructure for a standalone CLI tool running unattended. It does not carry over into
this skill as a file — but the *capability* it provided (continuing an interrupted run)
does, implemented differently:

- A saved journal file can drift from reality (e.g. a step was hand-edited in Pendo after
  the journal recorded it as done). An agent that can read the live Pendo UI doesn't have
  that problem — it can just look at the guide's actual current state instead of trusting
  a record of it.
- So instead of a journal, `pendo-workflow.md`'s (retired) step 2 had the skill **open any
  same-named existing guide and inspect it directly**: Draft status, app, step count,
  leftover placeholder text, and a content spot-check, compared against the execution
  plan. That classifies it as either already-complete (`status: already_exists` — leave
  it alone) or partial (`status: needs_input` — ask the user to resume, start over, or
  leave it).
- **Resume**, when the user chooses it, means continuing from the live-observed state —
  re-running whichever of steps 6/7/8 the comparison shows is still needed — not
  replaying a saved phase list.
- **Start over** requires deleting the existing partial guide first, which is a
  destructive action — get explicit confirmation before doing it, same as any other
  destructive action this skill might otherwise take.
- Concurrent runs against the same Pendo template/browser session aren't a concern the
  skill needs to solve itself — only one agent conversation is normally driving the
  browser at a time, so the legacy lock files aren't needed either.

This is a genuine capability improvement over the legacy mechanism, not just a
simplification — but it only works because the skill can inspect Pendo's real UI state.
If your browser tool can't reliably read back visible text/state (only fire actions
blind), fall back to the more conservative rule: treat every same-named match as
`needs_input` and let the user decide, without attempting automatic classification.

## Legacy selectors (last-resort disambiguation only)

Per the browser interaction rules in `SKILL.md`, prefer visible text and accessible
names. These are the selectors the legacy Playwright implementation used
(`src/pendo/selectors.ts`) — useful only if the current UI is ambiguous and you need a
concrete anchor to confirm you're looking at the right element, **not** as the primary way
to find anything:

- Template/guide details heading: `h1.pendo-page-header__title`
- Guide status control: `[data-cy="draft-status-dropdown"]`
- "More options" (overflow) menu: `[data-cy="guide-more-button"]`
- Clone/duplicate action in that menu: `[role="option"][aria-label="Clone guide"]`
- "Edit in Pendo" (in-place editor) action: `[data-cy="content-card-edit-in-pendo"]`
- "Edit in my app" (separate visual designer — **do not use**, see `pendo-workflow.md`
  step 4): `[data-cy="content-card-edit-in-app"]`
- Guide editor save action: a control labeled "Save guide"
- Per-step text block edit toggle: elements with `aria-label="Edit text block"`
- Per-step image/video block edit toggle: `aria-label="Edit image block"` /
  `aria-label="Edit video block"`
- Per-step duplicate/delete controls (visible on hover): `aria-label="Duplicate step N"` /
  `aria-label="Delete step N"` (N is the step's current 1-based position)
- Authenticated-shell indicator: `[data-cy="top-nav"]`

If Pendo's UI has changed enough that none of these resolve and no semantically
equivalent visible control can be found either, stop and report what you see rather than
guessing — this is exactly the `UNEXPECTED_PENDO_UI` case.

## Known limitations carried over from the legacy tool

- **Step order is grouped by media type**, not guide-content order, whenever a release
  mixes text/image/video features (see `pendo-workflow.md` step 5). This is intentional,
  not a bug to route around.
- **Video support is newer and less exercised** than text and image — it works against a
  Loom-configured master step but hasn't been validated against other providers.
- The separate visual designer ("Edit in my app") is entirely out of scope — anything
  only available there (custom CSS, polls, etc.) can't be configured by this skill.
