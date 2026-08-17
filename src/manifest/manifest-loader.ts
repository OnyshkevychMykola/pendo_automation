import fs from 'node:fs';
import path from 'node:path';
import { releaseManifestSchema, type ReleaseManifest } from './manifest-schema.js';
import { AutomationError } from '../errors/automation-error.js';
import { ErrorCode } from '../errors/error-codes.js';

export function loadManifest(manifestPath: string): { manifest: ReleaseManifest; manifestDir: string } {
  const absolute = path.resolve(manifestPath);

  if (!fs.existsSync(absolute)) {
    throw new AutomationError({
      code: ErrorCode.MANIFEST_INVALID,
      message: `Manifest file not found: ${absolute}`,
    });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch (err) {
    throw new AutomationError({
      code: ErrorCode.MANIFEST_INVALID,
      message: `Cannot parse manifest JSON: ${absolute}`,
      cause: err,
    });
  }

  const result = releaseManifestSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new AutomationError({
      code: ErrorCode.MANIFEST_INVALID,
      message: `Manifest validation failed:\n${issues}`,
    });
  }

  return {
    manifest: result.data,
    manifestDir: path.dirname(absolute),
  };
}
