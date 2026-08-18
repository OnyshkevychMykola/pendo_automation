---
name: pendo-release-guide
description: >
  Create a Draft Pendo release-note guide from manually prepared guide content
  (intro/features/outro JSON) by cloning a configured template guide and populating it
  through the live Pendo web UI. Use when asked to create, generate, or build a Pendo
  guide from a guide-content file or equivalent structured release content. Always
  creates the guide as Draft — never publishes or activates anything.
---

# Pendo release guide

This skill operates the Pendo web UI directly (as a signed-in human would) to turn
already-prepared guide content into a Draft Pendo guide. It is Phase 1 of a larger
project: it does **not** analyze releases, read Git/Jira, or generate guide content
itself — the guide content is always supplied by the user. See "Non-goals" below.

This skill is the orchestrator. It does not shell out to a separate application to do
the work — it reads its own configuration and reference docs, drives the browser tool
available in this environment directly, and reports what it observed. The one exception
is a narrow, deterministic helper script for guide-content validation (see step 2) —
everything Pendo-facing happens through direct browser interaction guided by
`references/pendo-workflow.md`.

## Prerequisites (runtime requirements)

This skill assumes the environment it runs in already provides:

- **A browser capability** — the ability to open Pendo, click/type/navigate, and read
  back what's actually visible on screen (not just fire-and-forget actions). Everything
  in `references/pendo-workflow.md` depends on being able to confirm visible state, not
  just perform clicks.
- **An authenticated Pendo session** in that same browser, established before this skill
  runs (see "Authentication" below). This skill does not log in on the user's behalf.
- **Local-file upload capability** — the ability to attach a local file to a file input
  in the browser — but **only if** the guide content includes at least one
  `media.type: "image"` feature. Text-only and video-only guide content never needs
  this, since video features only need a URL typed into a field.
- **Node.js**, to run `scripts/validate_guide_content.mjs` (no other dependency —
  the script is zero-dependency plain Node).

If any of these aren't available, stop before attempting the workflow and say exactly
which one is missing — don't attempt a partial run and hope the missing capability
doesn't come up.

## 1. Load inputs

- **Pendo configuration:** `references/pendo-config.yaml`. Resolve which `apps.<key>`
  entry to use (from what the user names, or `defaults.app` if only one is configured),
  then its `pages`, `templates`, and `guideNaming.pattern` entries.
- **Guide content:** whatever the user supplied — a path to a JSON file, or structured
  content pasted directly. See `references/guide-content.md` for the format (it's the
  same format the legacy Playwright tool used, so existing `release.json`-style files
  work unchanged). `references/guide-content.example.json` is a full valid example.

## 2. Validate before touching Pendo

Do not open or modify Pendo until you're confident the request is fully specified:

- The target app, page, and template all resolve to entries in `pendo-config.yaml`. If
  the user names an app/page/template that isn't configured, stop — report `CONFIG_ERROR`
  and don't guess a close match.
- The guide content is present and parses. If it's a file path, run:
  ```bash
  node scripts/validate_guide_content.mjs <path-to-guide-content.json>
  ```
  This checks the schema, plain-text rules, and every image asset (existence, format,
  size, path safety) deterministically — the kind of regex/byte-signature/size checking
  that's easy to get subtly wrong by inspection. Treat any `errors` in its output as
  `INPUT_ERROR` and stop. Surface `warnings` to the user but proceed. Use the
  `derived.generatedGuideName`, `derived.expectedSteps`, and `derived.imageAssets[].resolvedPath`
  values it computes rather than recomputing them by hand.
- If the guide content was supplied inline rather than as a file (no path to validate),
  apply the same rules from `references/guide-content.md` yourself before proceeding —
  don't skip validation just because the helper script doesn't apply.

If anything required can't be resolved safely, **stop before opening or modifying
Pendo**. Do not invent missing configuration or content.

## 3. Build the execution plan

Before touching the browser, make sure you can state the complete intended result:

```yaml
guide:
  name: "[AUTO][<releaseId>] <guideName>"   # from guideNaming.pattern
  app: <resolved app name>
  page: <resolved page name>
  template: <resolved template name/url>
  steps:
    - intro: { title, body }
    - <one entry per feature, grouped by media type — see pendo-workflow.md step 5>
    - outro: { title, body }
```

You don't need to persist this anywhere — it exists so that every later step is executed
against a known target, not worked out live UI-click by UI-click.

## 4. Execute the workflow

Follow `references/pendo-workflow.md` exactly, in order: verify the template contract →
re-verify the template → clone → open the editor → shape steps → populate content →
save as Draft → verify → report using the result contract above. That file captures the
actual ordering, invariants, and UI quirks extracted from the legacy Playwright
implementation — including *why* each non-obvious step exists. Do not reorder or skip
steps based on assumption.

This skill does **not** check the guide catalog for an existing guide with the same
computed name before cloning — that check was removed deliberately (see "Duplicate-name
checking is intentionally skipped" below). Go straight from template verification to
cloning.

## 5. Verify — never report success from "the button was clicked"

After saving, re-inspect the guide in Pendo and confirm what `pendo-workflow.md` step 8
lists (name, Draft status, app, step count, no leftover placeholder text, spot-checked
content). Success means the requested state was actually observed in Pendo, not that
every automation action completed without throwing. If something can't be confirmed from
the visible UI, say so explicitly.

## 6. Fail safely

If the live Pendo UI doesn't match what `pendo-workflow.md` describes, look for a
semantically equivalent visible control (same intent, different label — e.g. "Duplicate
guide" renamed to "Copy guide") before giving up. But adaptation has a hard limit: never
guess your way into a **Publish, Activate, Delete, Archive, Remove, or Disable** action.
If you're not confident a control is the safe, intended one, stop and report exactly
what you see instead of proceeding. See `references/troubleshooting.md` for the full
error taxonomy and how to report each kind clearly.

## Draft-only rule

Every guide this skill creates or edits stays in Draft. Never click Publish/Activate,
even if the user's phrasing seems to ask for it, and even though the legacy tool this was
migrated from was also draft-only by design. Publishing is a deliberately separate,
future capability.

## Media path resolution

- **Image paths** (`media.path`) resolve relative to the guide content file's own
  directory — never to the current working directory, and never as an absolute path
  outside it. `scripts/validate_guide_content.mjs` performs this resolution during
  validation (step 2) and returns each image's absolute `resolvedPath` in
  `derived.imageAssets` — use that resolved path when uploading, not the raw
  `media.path` string.
- **If an image asset is missing, unreadable, the wrong format, or too large**, this is
  caught at validation time (step 2) as `INPUT_ERROR`, before Pendo is touched.
- **If an asset that validated successfully becomes unavailable mid-run** (e.g. deleted
  between validation and the upload step, or the upload otherwise doesn't visibly take),
  stop with `SAVE_FAILED` — do not skip the image and continue as if the feature were
  text-only, and do not substitute a placeholder image. Report exactly which feature and
  path failed; the guide is left as a Draft with that one step incompletely populated.
- **Video URLs** are used as-is — this skill does not fetch or otherwise verify that a
  video URL is reachable or valid content, only that it's a well-formed URL (checked at
  validation time) and that the field visibly holds it after being set (checked in
  `pendo-workflow.md` step 6). A broken-but-well-formed Loom link will not be caught.

See `references/guide-content.md` for the full validation rules these paths go through.

## Result contract

Every run — success or failure — ends with a report in this shape. Don't omit fields;
use `null`/`not_verified` explicitly rather than leaving something out.

```yaml
status: created | needs_input | failed
guide:
  name: <computed guide name, or null if never resolved>
  url: <guide details URL, or null>
app: <resolved app name>
page: <resolved page name>
state: draft            # always "draft" whenever a guide exists — this skill never publishes
verification:
  nameMatches: true | false | not_verified
  statusIsDraft: true | false | not_verified
  appMatches: true | false | not_verified
  pageMatches: true | false | not_verified
  stepCountMatches: true | false | not_verified
  placeholdersClean: true | false | not_verified
  contentSpotChecked: true | false | not_verified
warnings: [ ... ]        # non-fatal issues surfaced along the way
errors: [ { category, message } ]   # empty on success; category from troubleshooting.md
```

- `status: created` — a new guide was cloned, populated, saved, and verified this run.
- `status: needs_input` — stopped before making a (further) decision because something
  requires the user's input (config/content unresolved, template fingerprint mismatch,
  etc.); `errors` explains what's needed.
- `status: failed` — stopped due to an error after validation passed; `errors` explains
  what and at what point.

## Duplicate-name checking is intentionally skipped

Earlier versions of this skill searched the guide catalog for an existing guide with the
computed name before cloning, and classified any match as already-complete, partial, or
ambiguous (see `references/troubleshooting.md`'s "Existing-guide handling" section for
the retired rationale). That check is deliberately removed: cloning the template always
produces a new guide with its own ID, so Pendo has no real duplicate-name constraint to
protect against, and the check cost a full guide-catalog search on every run for no safety
benefit. If a same-named guide already exists from a prior run, this skill simply clones
another one — do not search for it, classify it, or ask the user how to handle it. If the
clone or a later step fails for an unrelated reason, stop and report it normally; leaving
behind a partially-shaped duplicate draft is an acceptable outcome, not a failure to
recover from.

## Authentication

This skill assumes the browser tool available in this environment is already signed into
Pendo (persistent profile, SSO, or however your environment handles it — the legacy
project used a dedicated persistent Chrome profile so sign-in only had to happen once;
see its `README.md` "Authenticate" section for that pattern if you need to replicate it).
This skill never stores, requests, or reads credentials, tokens, or session cookies —
none belong in `pendo-config.yaml`, this file, or any reference doc. If the browser isn't
authenticated, stop and report `AUTH_ERROR` with instructions to sign in through
whatever mechanism your environment uses; do not attempt to log in on the user's behalf.

## Guide content fidelity

Use the supplied guide content verbatim. Do not rewrite, shorten, or "improve" copy, and
do not invent content for missing fields — that's out of scope for Phase 1 (a later
phase may generate content from a release; this skill only consumes already-written
content). Only normalize purely mechanical formatting Pendo itself requires.

## Non-goals (do not implement)

Git/tag/commit/PR analysis, Jira lookup, automatic feature detection, automatic
generation of guide content, Confluence publishing, release-repository updates, branch
creation, commits, pull requests, AI-generated screenshots/video, or automatic Pendo
publication/activation. If a request needs any of these, say so rather than
approximating them.

## References

- `references/pendo-config.yaml` — reusable Pendo app/page/template configuration.
- `references/pendo-workflow.md` — the detailed, ordered browser workflow.
- `references/guide-content.md` — the guide-content input format.
- `references/guide-content.example.json` — a full valid example.
- `references/troubleshooting.md` — error taxonomy, existing-guide handling rationale,
  and last-resort selector hints.
- `scripts/validate_guide_content.mjs` — deterministic guide-content/asset validation.
