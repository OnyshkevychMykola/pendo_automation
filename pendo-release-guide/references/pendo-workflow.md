# Pendo release-guide workflow

This is the actual, observed workflow for creating a release-note guide in Pendo,
extracted from the legacy Playwright implementation (`src/workflow/release-orchestrator.ts`
and `src/pendo/**`), which is the executable specification for this skill. Every
non-obvious step below states the invariant or bug it exists to prevent — that reasoning
is more important than any specific selector, and must survive UI changes that the
selectors themselves won't.

Follow the priority order for identifying on-screen controls: visible text and label →
accessible role/name → surrounding UI context → a stable Pendo identifier as a last
resort (see `references/troubleshooting.md` for the legacy selectors, kept only as
disambiguation hints, not as the primary way to find things).

## 0. Preconditions

- A Pendo session must already be signed in through whatever persistent browser
  profile/session the execution environment provides. This skill does not perform
  interactive login (see "Authentication" in `SKILL.md`). If the browser lands on a
  Pendo/Auth0 login, MFA, or access-denied page at any point, stop — do not attempt to
  guess credentials or bypass the check. Report `AUTH_ERROR`.
- Resolve the target app, page, and template from `references/pendo-config.yaml` and the
  guide content before touching the browser (see `SKILL.md` step 2, "Validate required
  information"). Do not open Pendo just to "see what's there" as a substitute for
  resolving config.

## 1. Verify the template contract (read-only, before anything is created)

Before cloning anything, open the configured template guide's details page directly
(`apps.<app>.templates.<template>.url`) and confirm, without modifying it:

- Its name matches `templates.<template>.name` exactly.
- Its status is Draft (never proceed against a Public/Active template).
- Its step count matches `templates.<template>.structure.stepCount` (5 in the default
  contract).
- The second step's visible preview text contains the configured feature-step
  placeholder (`structure.placeholders.featureTitle`).

If any of these don't match, stop with `TEMPLATE_NOT_FOUND` or `UNEXPECTED_PENDO_UI` and
report exactly what differed. **Never clone from a template that fails this check** —
this is the main safety net against a human having edited the shared template since the
last time it was verified. (Legacy: `TemplateInspector.verifyFingerprint`.)

The step-preview carousel on the details page can render a beat after the rest of the
page — if step count reads as 0 immediately after navigation, wait briefly for the
step-preview thumbnails to actually appear before trusting the count.

## 2. Re-verify the template immediately before cloning

**No duplicate-name check runs before this step.** Earlier versions of this workflow
searched the guide catalog for a guide already named `[AUTO][<releaseId>] <guideName>`
and classified any match as already-complete, partial, or ambiguous before proceeding.
That check has been removed deliberately: cloning always creates a new guide with its own
ID regardless of what else shares its name, so there's no real duplicate-name hazard to
guard against, and the catalog search cost real time on every run for no corresponding
safety benefit. Go straight from the step-1 template check to cloning. If this produces a
second guide with the same computed name as one from an earlier run, that's an accepted,
harmless outcome — do not search for it or ask the user how to reconcile it. (See
`references/troubleshooting.md`'s "Existing-guide handling" section for the retired
rationale, kept there for history only.)

Re-check the template's name and Draft status right before triggering the clone action
(not just once, earlier). Between the step-1 check and now, a human could have started
editing the shared template. If it no longer matches, stop — do not clone.

## 3. Clone the template

1. From the template's details page, open its overflow/"more options" menu and choose
   the action that **duplicates or copies the guide** (labeled "Clone guide" in the
   current UI; also accept "Duplicate guide" or "Copy guide" as equivalents — see
   "Adapting to UI changes" in `SKILL.md`). This is a safe, non-destructive action on the
   *template* since it creates a new guide rather than altering the template itself.
2. A dialog opens to name the new guide. Set its name to the computed name from
   `SKILL.md` step 3 ("Build the execution plan"). The app selector in this dialog should
   already default to the template's own app —
   confirm it does; don't change it.
3. Confirm the clone. Wait for navigation to the new guide's own details page — the URL
   changing to a new guide is the signal the clone succeeded, not just the dialog
   closing.

**Quirk to expect:** right after cloning, Pendo sometimes opens the new guide's title in
an inline rename/edit state instead of showing it as a plain heading (this seems tied to
the `redirectFromCloning` flow). If the title heading isn't visible, look for a
confirm/checkmark control next to the name field and use it to commit the name — do not
rely on pressing Escape to dismiss this state, it does not reliably close it. If no
confirm control appears either, just wait briefly; the heading may simply be slow to
render.

## 4. Open the guide editor

From the new guide's details page, use the action that opens the **in-place guide
editor** (labeled "Edit in Pendo" currently) — **not** the separate visual/"Edit in my
app" designer. The separate visual designer opens a new tab, requires the *product's*
own authentication (not Pendo's), and its drag-and-drop-heavy UI was found too unreliable
to drive — it is out of scope for this skill entirely, both for editing and for step
reordering.

If opening the editor redirects to an SSO/login/auth page instead of the editor, the
Pendo session likely needs re-authentication. Navigate back to the guide details page and
retry once. If it redirects to SSO again on the retry, stop with `AUTH_ERROR` and report
that re-authentication is needed — don't retry indefinitely.

Confirm you're actually in the editor (a "Save guide" control is visible, and the URL is
the guide-editor URL) before proceeding to shape or edit anything.

## 5. Shape the steps to match the guide content

The template ships with exactly one master step per content shape: **Intro** (always
kept), **Master Feature** (text-only), **Master Image**, **Master Video**, **Outro**
(always kept). Do not use Pendo's "Add step" block-type picker to create new steps from
scratch — the legacy implementation found that flow too fragile to drive reliably.
Instead, **duplicate a pre-built master step** for every feature that needs its shape,
and **delete a master step entirely** if no feature needs that shape:

1. Count how many features in the guide content need each media type: `none` (text-only),
   `image`, `video`.
2. For each of the three master step types, in this exact order — **video first, then
   image, then text-only** — duplicate or delete as needed:
   - If N ≥ 1 features need that type: duplicate that master step (N − 1) more times
     (the master itself counts as the first copy). Hover the step to reveal its
     duplicate control, then use it.
   - If zero features need that type: delete that master step entirely (hover to reveal
     its delete control).
   - **Why this exact order matters:** duplicating or deleting a step shifts the position
     of every step after it. Processing video → image → text-only (i.e. last-positioned
     master to first-positioned master) guarantees that acting on one master step never
     moves a master step you haven't gotten to yet. Doing this in any other order will
     shape the wrong steps.
3. After shaping, verify the total step count equals `feature count + 2` (intro + outro).
   If it doesn't, stop with `UNEXPECTED_PENDO_UI` — do not keep clicking to try to fix it.

**Known, accepted limitation — do not "fix" this:** because shaping works per media type,
the final step order is always grouped by type: all text-only features, then all image
features, then all video features, regardless of the order features appear in the guide
content. If the guide content interleaves types (text, image, text, video, ...), the
resulting Pendo step order will not match that interleaving. This is intentional and
matches the legacy tool's behavior — do not attempt manual drag-and-drop reordering to
compensate; that's out of scope for this skill. If a specific order is required, say so
in the report rather than trying to force it.

## 6. Populate content, in this order: Intro → grouped features → Outro

For every step (intro, each shaped feature step, outro), in the order established by
shaping:

1. Open the step's **title** text block, replace its text with the exact title from the
   guide content (intro title, feature title, or outro title), and commit the edit
   (typically by tabbing/clicking away to blur the editor).
2. Open the step's **body** text block the same way, using the description field.
3. **Read the visibly saved text back from the step's own display** (not from whatever
   transient editing widget was open) and confirm it matches what was written, ignoring
   leading/trailing whitespace and line-ending differences. If it doesn't match, stop
   with `SAVE_FAILED` rather than moving on — a silent write failure here is worse than
   stopping.
4. **Only after both title and body are confirmed**, if the feature has media:
   - **Image:** open the step's image block. Upload the local file referenced by the
     feature's `media.path` (resolved relative to the guide content file's own directory
     — see `references/guide-content.md` for path-resolution and validation rules; never
     treat an unresolved or out-of-directory path as safe to upload). Set the alt text.
     Uploads are asynchronous — wait until the block's own "Image URL" (or equivalent
     visible state) actually reflects the new file before moving on; don't assume the
     upload finished just because the file picker closed. If the file that validated
     successfully in step 2 is no longer readable at upload time (removed, moved,
     permissions changed), or the upload never visibly completes, stop with
     `SAVE_FAILED` — do not silently skip the image and leave the step text-only, and do
     not substitute any other image. Report the feature and the exact path that failed.
   - **Video:** open the step's video block and set the video URL (and title, if given).
     The master video step's provider is pre-configured in the template (Loom in the
     current template) — do not attempt to change the provider; only the URL/title need
     to change. Confirm the URL field reflects what was entered before moving on.

Use the guide content's text **exactly as provided** — do not rewrite, shorten, or
"improve" copy. Only normalize purely mechanical formatting Pendo itself requires (e.g.
trimming incidental whitespace); never change meaning. This is a hard rule for Phase 1 —
AI-authored guide copy is an explicitly out-of-scope future capability, not something to
approximate now.

If a text block's active editor becomes ambiguous (e.g. a previous block's editor is
still visibly present when opening the next one), re-confirm which block is actually
focused before typing — do not type into a step blind.

## 7. Save as Draft — never publish

Use the editor's save action, then use its close/back action to return to the guide's
own details page. **Do not click any Publish, Activate, or "make public" control at any
point in this workflow**, even if one is visibly available. Every guide this skill
creates must be left in Draft status — publishing is an explicit non-goal of this phase,
regardless of what the legacy tool did or what a user seems to imply they want. If a
request seems to ask for publishing, say so explicitly rather than doing it.

## 8. Verify the result — do not trust "the button was clicked"

Re-open (or confirm you're still on) the saved guide's details page and check, from what
is actually visible in the UI:

- **Name** matches the computed guide name exactly.
- **Status** is Draft. If it reads Public/Active/anything else, stop immediately and
  report it as a serious finding — do not attempt to fix a guide's publish state
  yourself.
- **App** shown in the guide's subtitle matches the configured `appName`.
- **Step count** equals `feature count + 2`.
- **No leftover template placeholder text** is visible in any step's preview — check
  each step's visible preview text against `structure.placeholders` from the config. Any
  match means some step's content was never actually replaced.
- Each step's title/body reads as what was intended (spot-check against the guide
  content, not just presence of *some* text).

Report exactly what was and wasn't verified. If something can't be confirmed from the
visible UI (e.g. targeting/segmentation details that aren't shown on this page), say so
explicitly instead of assuming success. Success means "the requested state was observed
in Pendo," not "the automation ran to completion without an error."

(Legacy: `GuideVerifier.verifyDraftGuide` + `verifyNoPlaceholdersRemain`.)

## 9. Report

Summarize: guide name, guide URL, target app, step count vs. expected, how many features
were text/image/video, Draft status, and the verification outcome — including anything
left unverified. This mirrors the legacy tool's run summary (`summary.md`/console
output) but is delivered as the skill's final response rather than written to a file.
