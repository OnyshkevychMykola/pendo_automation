# Guide content format

This is the runtime input for a single guide-creation request — release-specific content
(intro, features, outro), as opposed to `pendo-config.yaml`'s reusable Pendo/app
knowledge. It is **byte-for-byte the same format** the legacy Playwright tool consumed as
`release.json` (see `src/manifest/manifest-schema.ts`), so existing content files continue
to work unchanged. A user can hand this skill an existing `release.json` and it should
just work.

A full, valid example is in `references/guide-content.example.json`.

## Top-level shape

```jsonc
{
  "schemaVersion": 1,
  "releaseId": "2026-09-release",
  "guideName": "September 2026 Release Notes",
  "intro": { "title": "...", "description": "..." },
  "features": [ /* one or more feature objects, see below */ ],
  "outro": { "title": "...", "description": "..." }
}
```

| Field | Rules |
|---|---|
| `schemaVersion` | Must be exactly `1`. |
| `releaseId` | Lowercase, filesystem-safe: must match `^[a-z0-9][a-z0-9._-]*$`. Used to build the guide's name and as its idempotency key (see step 2 in `pendo-workflow.md`). |
| `guideName` | Non-empty display name for the release. Combined with `releaseId` into the final guide name using the pattern in `pendo-config.yaml`'s `guideNaming.pattern` (default: `[AUTO][{releaseId}] {guideName}`). |
| `intro` / `outro` | `{ title, description }` — always-present guide bookends. Both fields follow the "plain text" rules below. |
| `features` | Array of at least one feature object (see below). |

No fields beyond these are accepted (the legacy schema is `.strict()` — reject unknown
top-level fields rather than silently ignoring them, so typos or leftover fields from a
different format are caught instead of dropped).

## Feature objects

```jsonc
{
  "id": "faster-worklist-filters",
  "title": "Faster worklist filters",
  "description": "Worklist filters now respond more quickly...",
  "media": { "type": "none" }
}
```

| Field | Rules |
|---|---|
| `id` | Lowercase, must match `^[a-z0-9][a-z0-9-_]*$`. Must be unique across all features in the file — duplicates are a hard `INPUT_ERROR`, not a warning. |
| `title` / `description` | Plain text rules below. `description` maps to the step's body. |
| `media` | One of the three shapes below. Determines which master step type this feature is shaped from — see `pendo-workflow.md` step 6. |

### `media.type: "none"`
```json
{ "type": "none" }
```
Text-only feature (title + body, no image/video block).

### `media.type: "image"`
```json
{ "type": "image", "path": "./assets/worklist-filters.png", "alt": "Updated worklist filter controls" }
```
- `path` is resolved **relative to the guide content file's own directory** — not the
  current working directory, not an absolute path. A path that resolves outside that
  directory (via `..` or a symlink) must be rejected, not silently allowed.
- File must exist, be `.png`/`.jpg`/`.jpeg`, and its content must actually match that
  extension (checked via file signature/magic bytes, not just the file name) — the
  bundled helper script performs this check (see below).
- Max size 30 MB (hard limit); a file over 5 MB should be flagged as a warning but is
  still allowed.
- `alt` is required, non-empty, plain text.

### `media.type: "video"`
```json
{ "type": "video", "url": "https://www.loom.com/share/...", "title": "August 2026 walkthrough" }
```
- `url` must be a valid URL. `title` is optional.
- The template's video master step has its provider pre-configured (Loom, currently) —
  only the URL/title are set per guide; the provider itself is not part of this schema
  because it isn't meant to change per release. Video support is newer/less
  battle-tested than text and image (carried over from the legacy tool's own caveat) —
  treat unexpected behavior here as worth a closer look, not necessarily a skill bug.

## "Plain text" rules (title/description/alt/video title fields)

- Non-empty after trimming whitespace.
- No control characters other than `\n`, `\r`, `\t`.
- Must not contain the literal substring `__RN_` (a reserved template-marker prefix from
  the legacy implementation's internals — content containing it is rejected rather than
  silently passed through, in case it indicates a corrupted or wrong-format file).

## Validating before touching Pendo

Run the bundled helper before acting on any guide content file:

```bash
node scripts/validate_guide_content.mjs /path/to/guide-content.json
```

It re-implements the checks above (schema shape, plain-text rules, image asset
existence/format/size/path-safety) without needing the legacy project's dependencies, and
prints a JSON report: `{ valid, errors[], warnings[], derived }`, where `derived` includes
the computed guide name, expected step count (`features.length + 2`), and each image
feature's resolved absolute path (hand this resolved path to the upload step in
`pendo-workflow.md`, not the raw `media.path`). Treat any non-empty `errors[]` as
`INPUT_ERROR` — stop before opening Pendo. Surface `warnings[]` to the user but proceed.

This mirrors the legacy `npm run release:validate` command's checks
(`src/manifest/manifest-validator.ts`, `src/manifest/asset-validator.ts`), reimplemented
standalone so this skill doesn't need to install or invoke the legacy Node project.
