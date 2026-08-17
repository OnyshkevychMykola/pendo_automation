import fs from 'node:fs';
import path from 'node:path';
import { resolveAssetPath } from '../util/paths.js';
import { AutomationError } from '../errors/automation-error.js';
import { ErrorCode } from '../errors/error-codes.js';

const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);
const MAX_SIZE_BYTES = 30 * 1024 * 1024;
const WARN_SIZE_BYTES = 5 * 1024 * 1024;

// File signature bytes (magic numbers)
const SIGNATURES: Array<{ ext: string[]; bytes: number[]; offset: number }> = [
  { ext: ['.png'], bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0 },
  { ext: ['.jpg', '.jpeg'], bytes: [0xff, 0xd8, 0xff], offset: 0 },
];

function detectSignature(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const buffer = Buffer.alloc(8);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, buffer, 0, 8, 0);
  } finally {
    fs.closeSync(fd);
  }

  for (const sig of SIGNATURES) {
    if (!sig.ext.includes(ext)) continue;
    const matches = sig.bytes.every((b, i) => buffer[sig.offset + i] === b);
    if (matches) return true;
  }
  return false;
}

export interface AssetValidationResult {
  resolvedPath: string;
  sizeBytes: number;
  warn?: string;
}

export function validateImageAsset(
  manifestDir: string,
  assetPath: string,
): AssetValidationResult {
  let resolvedPath: string;
  try {
    resolvedPath = resolveAssetPath(manifestDir, assetPath);
  } catch (err) {
    throw new AutomationError({
      code: ErrorCode.ASSET_PATH_TRAVERSAL,
      message: `Asset path traversal rejected: ${assetPath}`,
      cause: err,
    });
  }

  if (!fs.existsSync(resolvedPath)) {
    throw new AutomationError({
      code: ErrorCode.ASSET_NOT_FOUND,
      message: `Image file not found: ${resolvedPath}`,
      details: { assetPath, resolvedPath },
    });
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new AutomationError({
      code: ErrorCode.ASSET_FORMAT_INVALID,
      message: `Unsupported image format "${ext}". Allowed: .png, .jpg, .jpeg`,
      details: { resolvedPath },
    });
  }

  if (!detectSignature(resolvedPath)) {
    throw new AutomationError({
      code: ErrorCode.ASSET_FORMAT_INVALID,
      message: `File signature does not match extension "${ext}": ${resolvedPath}`,
      details: { resolvedPath },
    });
  }

  const { size } = fs.statSync(resolvedPath);
  if (size > MAX_SIZE_BYTES) {
    throw new AutomationError({
      code: ErrorCode.ASSET_TOO_LARGE,
      message: `Image exceeds 30 MB limit (${(size / 1024 / 1024).toFixed(1)} MB): ${resolvedPath}`,
      details: { resolvedPath, sizeBytes: size },
    });
  }

  return {
    resolvedPath,
    sizeBytes: size,
    warn: size > WARN_SIZE_BYTES
      ? `Image is larger than 5 MB (${(size / 1024 / 1024).toFixed(1)} MB): ${resolvedPath}`
      : undefined,
  };
}
