# Pendo Release Automation

Generates Pendo release-note guides automatically from a structured JSON manifest — no manual
clicking through the Pendo Guide Editor for every release. Point it at a `release.json`
describing your intro, features (with optional screenshots or Loom videos), and outro, and it
clones your template guide, builds out the steps, fills in the content, saves it as a Draft, and
verifies the result.

It never publishes anything — every run stops at a Draft guide so a human always does the final
review and publish in Pendo.

## How it works

The tool drives a real, visible Chrome browser via [Playwright](https://playwright.dev) against
your actual Pendo instance — it does not use Pendo's API. This means it's inherently a bit
fragile to Pendo UI changes (selectors are centralized in `src/pendo/selectors.ts` for exactly
that reason), but it also means there's nothing to keep in sync with an external API: it uses the
same editor you would, just faster and consistently.

### The template

Everything starts from one designated **template guide** in Pendo, configured via
`templateGuideUrl`. Before every run, the tool re-verifies the template's exact structure (name,
Draft status, step count, placeholder text) and refuses to proceed if it has drifted — see
`src/pendo/ui-contract.ts` and `src/pendo/template-inspector.ts`. This is the main safety net
against a human accidentally editing the shared template.

The template has 5 steps, each a "master" for one shape of content:

| # | Step | Purpose |
|---|------|---------|
| 1 | Intro | Always kept, content replaced |
| 2 | Master Feature Step | Text-only feature (title + body) |
| 3 | Master Image Step | Feature with a title + body + image block |
| 4 | Master Video Step | Feature with a title + body + video (Loom) block |
| 5 | Outro | Always kept, content replaced |

### Shaping steps to match your manifest

For each feature in the manifest, the tool figures out how many features need each media type
(none / image / video), then for each of the 3 master steps: duplicates it `N-1` times if `N`
features need that type, or deletes it entirely if no feature needs it. This avoids Pendo's
"Add New Step" block-type picker, which turned out to be too fragile to drive reliably via
automation — duplicating a pre-built master step and overwriting its content is far more robust.

**Known limitation:** because of this, the final step order is always grouped by media type —
all text-only features, then all image features, then all video features — regardless of the
order they appear in your manifest. If you need a specific interleaved order (e.g. text, image,
text, video), reorder the steps manually in Pendo afterwards; the automation does not attempt
drag-and-drop step reordering.

### Populating content

Once shaped, every step's title and body text blocks are opened and overwritten (with a
read-back check that the saved text matches what was written), and for image/video steps, the
relevant block is opened and:

- **Image:** the local file (from your manifest's `media.path`) is uploaded through the block's
  file input, and the alt text is set. The tool polls until the block's "Image URL" field
  reflects the new upload before moving on.
- **Video:** the block's "Video URL" (and optional title) fields are filled directly — the
  master step's video provider is preset to Loom, so only the URL needs to change.

### Resuming after a failure

Every run writes a journal (`state/run-journal/<releaseId>.json`) after each phase completes
(cloned → steps-shaped → text-populated → media-populated → saved → verified). If a run fails
partway through, re-run with `--resume` to continue from the last completed phase instead of
starting over and creating a duplicate guide.

## Prerequisites

- Node.js 20+
- Google Chrome installed (the tool drives real Chrome, not Playwright's bundled Chromium)
- A Pendo account with access to your target subscription
- A template guide already built in Pendo with the 5-step structure described above (see
  `src/pendo/ui-contract.ts` for the exact placeholder text and step order the tool checks for)

## Setup

```bash
npm ci
cp pendo-automation.config.example.json pendo-automation.config.json
```

Edit `pendo-automation.config.json`:

| Field | Meaning |
|---|---|
| `baseUrl` | Your Pendo app URL (usually `https://app.pendo.io`) |
| `targetAppName` | The Pendo "app" your guides are attached to, as shown in the guide subtitle |
| `templateGuideName` | Exact name of your template guide |
| `templateGuideUrl` | Direct URL to the template guide's details page |
| `templateVersion` | Bump this yourself whenever you intentionally change the template, so old journals can detect drift |
| `expectedPageName` | The Pendo page your guides target |
| `browser` | Viewport, timeouts, Chrome channel, slow-motion delay |
| `paths` | Where artifacts (screenshots/logs) and state (journals/locks) are written |

This file is gitignored — it's specific to your Pendo instance and never committed.

`.env` is optional and rarely needed — see `.env.example`. The only thing it can override today
is the config file path (`PENDO_AUTOMATION_CONFIG`), and only if you don't want to use
`--config <path>` on the CLI instead. It is not auto-loaded by the CLI; export it in your shell
or use a loader of your choice if you want it picked up automatically.

## Authenticate

The tool reuses a dedicated, persistent Chrome profile (separate from your personal Chrome —
see `src/browser/profile-paths.ts`) so you only need to log in once:

```bash
npm run pendo:auth
# Complete sign-in (and MFA/SSO if applicable) in the browser window that opens, then close it
```

## Verify setup

```bash
npm run pendo:doctor
```

Checks the Pendo session, target app, and template fingerprint without creating anything.

## Prepare a release

```
releases/
  <releaseId>/
    release.json
    assets/
      feature-image.png
```

`release.json` schema (see `src/manifest/manifest-schema.ts` for the authoritative version):

```jsonc
{
  "schemaVersion": 1,
  "releaseId": "2026-09-release",        // filesystem-safe id; used in the generated guide name
  "guideName": "September 2026 Release Notes",
  "intro": { "title": "...", "description": "..." },
  "features": [
    { "id": "feature-a", "title": "...", "description": "...", "media": { "type": "none" } },
    {
      "id": "feature-b",
      "title": "...",
      "description": "...",
      "media": { "type": "image", "path": "./assets/feature-b.png", "alt": "..." }
    },
    {
      "id": "feature-c",
      "title": "...",
      "description": "...",
      "media": {
        "type": "video",
        "url": "https://www.loom.com/share/...",
        "title": "..." // optional
      }
    }
  ],
  "outro": { "title": "...", "description": "..." }
}
```

Image assets must be `.png`/`.jpg`/`.jpeg`, under 30MB (a warning is logged above 5MB), and are
resolved relative to the manifest file — see `src/manifest/asset-validator.ts`. A full working
example (all three media types) is in `releases/example-release/`.

```bash
npm run release:validate -- releases/<releaseId>/release.json
```

Validates the manifest and assets without opening a browser — safe to run repeatedly.

## Create a Draft guide

```bash
npm run release:create -- releases/<releaseId>/release.json
```

Add `--slow` to slow down browser actions for visual debugging, `--debug` for verbose logs, or
`--keep-browser-open` to leave the browser open after completion or failure for inspection.

## Resume after failure

```bash
npm run release:create -- releases/<releaseId>/release.json --resume
```

## Project structure

```
src/
  cli.ts                    Command definitions (commander)
  commands/                 One file per CLI command
  config/                   Config file loading + schema
  manifest/                 Manifest loading, schema, validation, asset checks, name generation
  browser/                  Playwright browser/profile lifecycle, auth detection
  pendo/
    selectors.ts             All Pendo DOM selectors, centralized
    ui-contract.ts            Template structure invariants (step count, order, placeholders)
    template-inspector.ts     Pre-flight template fingerprint verification
    guide-finder.ts           Catalog search / duplicate detection
    guide-verifier.ts         Post-save verification
    pages/                    One class per Pendo screen/component (guide details, editor, steps, text/image/video editors)
  state/                    Run journal (resume support), release/profile locks
  workflow/                 The end-to-end orchestration (release-orchestrator.ts)
  observability/            Structured logging, artifacts (screenshots/snapshots), run summaries
  errors/                   Typed error codes and exit code mapping
tests/                      Unit tests (vitest) — schema, journal, error codes, name generation
releases/                  Your release manifests (gitignored except the example)
state/                     Journals and locks (gitignored)
artifacts/                 Per-run screenshots, snapshots, traces (gitignored)
```

## Exit codes

| Code | Meaning |
|---:|---|
| `0` | Success |
| `2` | Config / manifest / asset validation error |
| `3` | Authentication or access error |
| `4` | Target app, template, or preflight error |
| `5` | Duplicate guide, journal mismatch, or invalid resume |
| `6` | Browser profile or release lock conflict |
| `7` | Pendo UI execution error (clone, rename, step shaping, text/image/video population, save) |
| `8` | Post-save verification failure |
| `9` | Unexpected internal error |

## Known limitations

- **Step order is grouped by media type**, not manifest order, when a release mixes text/image/
  video features — see "Shaping steps" above.
- **Video support is newer and less battle-tested** than text and image — it works end-to-end
  against a Loom-configured master step, but hasn't been exercised against other providers or
  edge cases yet.
- Everything runs through the same-tab "Edit in Pendo" guide editor, not Pendo's separate Visual
  Designer ("Edit in my app") — exploration showed the Visual Designer's drag-and-drop UI is too
  fragile to automate reliably, but it also means anything only available there (custom CSS
  styling, polls, etc.) is out of scope for this tool.
