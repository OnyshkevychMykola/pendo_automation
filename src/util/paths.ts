import path from 'node:path';
import fs from 'node:fs';

export function resolveAssetPath(manifestDir: string, assetPath: string): string {
  const resolved = path.resolve(manifestDir, assetPath);

  // Reject path traversal outside manifest directory
  const relative = path.relative(manifestDir, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Asset path escapes manifest directory: ${assetPath}`);
  }

  // Reject symlinks pointing outside
  if (fs.existsSync(resolved)) {
    const real = fs.realpathSync(resolved);
    const realDir = fs.realpathSync(manifestDir);
    const relReal = path.relative(realDir, real);
    if (relReal.startsWith('..') || path.isAbsolute(relReal)) {
      throw new Error(`Asset symlink escapes manifest directory: ${assetPath}`);
    }
  }

  return resolved;
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function timestampedDir(base: string, releaseId: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15) + 'Z';
  return path.join(base, releaseId, ts);
}
