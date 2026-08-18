#!/usr/bin/env node
// Deterministic validation of a guide-content JSON file, plus the asset checks (file
// existence, extension, magic-byte signature, size limits, path-traversal safety) that
// are impractical to judge reliably by eye. Zero dependencies — mirrors, without
// reimplementing wholesale, the legacy project's
// src/manifest/manifest-schema.ts + src/manifest/asset-validator.ts + src/manifest/name-generator.ts.
//
// This is intentionally narrow: it validates and resolves paths, nothing else. It does
// not talk to Pendo and does not touch a browser — see references/pendo-workflow.md for
// everything downstream of a valid guide-content file.
//
// Usage: node validate_guide_content.mjs <path-to-guide-content.json>
// Prints one JSON object to stdout: { valid, errors: string[], warnings: string[], derived }

import fs from 'node:fs';
import path from 'node:path';

const TEMPLATE_MARKER = '__RN_';
const SUPPORTED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const WARN_IMAGE_BYTES = 5 * 1024 * 1024;
const RELEASE_ID_RE = /^[a-z0-9][a-z0-9._-]*$/;
const FEATURE_ID_RE = /^[a-z0-9][a-z0-9-_]*$/;

function fail(errors, warnings) {
  return { valid: false, errors, warnings, derived: null };
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkPlainText(value, label, errors) {
  if (typeof value !== 'string') {
    errors.push(`${label}: must be a string`);
    return;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    errors.push(`${label}: must be non-empty`);
  }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(value)) {
    errors.push(`${label}: must not contain control characters`);
  }
  if (value.includes(TEMPLATE_MARKER)) {
    errors.push(`${label}: must not contain reserved template markers (${TEMPLATE_MARKER}...)`);
  }
}

function checkSection(section, label, errors) {
  if (!isPlainObject(section)) {
    errors.push(`${label}: must be an object with title/description`);
    return;
  }
  const allowed = new Set(['title', 'description']);
  for (const key of Object.keys(section)) {
    if (!allowed.has(key)) errors.push(`${label}.${key}: unknown field`);
  }
  checkPlainText(section.title, `${label}.title`, errors);
  checkPlainText(section.description, `${label}.description`, errors);
}

function detectImageSignature(filePath, ext) {
  const buffer = Buffer.alloc(8);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, buffer, 0, 8, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (ext === '.png') {
    return [0x89, 0x50, 0x4e, 0x47].every((b, i) => buffer[i] === b);
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    return [0xff, 0xd8, 0xff].every((b, i) => buffer[i] === b);
  }
  return false;
}

function resolveAssetPath(manifestDir, assetPath) {
  const resolved = path.resolve(manifestDir, assetPath);
  const relative = path.relative(manifestDir, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Asset path escapes the guide content file's directory: ${assetPath}`);
  }
  if (fs.existsSync(resolved)) {
    const real = fs.realpathSync(resolved);
    const realDir = fs.realpathSync(manifestDir);
    const relReal = path.relative(realDir, real);
    if (relReal.startsWith('..') || path.isAbsolute(relReal)) {
      throw new Error(`Asset symlink escapes the guide content file's directory: ${assetPath}`);
    }
  }
  return resolved;
}

function validateImageAsset(manifestDir, assetPath, errors, warnings, featureId) {
  let resolvedPath;
  try {
    resolvedPath = resolveAssetPath(manifestDir, assetPath);
  } catch (err) {
    errors.push(`features[${featureId}].media.path: ${err.message}`);
    return null;
  }

  if (!fs.existsSync(resolvedPath)) {
    errors.push(`features[${featureId}].media.path: file not found: ${resolvedPath}`);
    return null;
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  if (!SUPPORTED_IMAGE_EXTENSIONS.has(ext)) {
    errors.push(`features[${featureId}].media.path: unsupported extension "${ext}" (allowed: .png, .jpg, .jpeg)`);
    return null;
  }

  if (!detectImageSignature(resolvedPath, ext)) {
    errors.push(`features[${featureId}].media.path: file signature does not match extension "${ext}": ${resolvedPath}`);
    return null;
  }

  const { size } = fs.statSync(resolvedPath);
  if (size > MAX_IMAGE_BYTES) {
    errors.push(`features[${featureId}].media.path: exceeds 30 MB limit (${(size / 1024 / 1024).toFixed(1)} MB)`);
    return null;
  }
  if (size > WARN_IMAGE_BYTES) {
    warnings.push(`features[${featureId}].media.path: larger than 5 MB (${(size / 1024 / 1024).toFixed(1)} MB): ${resolvedPath}`);
  }

  return { resolvedPath, sizeBytes: size };
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.log(JSON.stringify(fail(['Usage: node validate_guide_content.mjs <path-to-guide-content.json>'], [])));
    process.exit(2);
  }

  const absolute = path.resolve(filePath);
  const manifestDir = path.dirname(absolute);
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(absolute)) {
    console.log(JSON.stringify(fail([`File not found: ${absolute}`], [])));
    process.exit(2);
  }

  let content;
  try {
    content = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch (err) {
    console.log(JSON.stringify(fail([`Cannot parse JSON: ${err.message}`], [])));
    process.exit(2);
  }

  if (!isPlainObject(content)) {
    console.log(JSON.stringify(fail(['Top level must be a JSON object'], [])));
    process.exit(2);
  }

  const allowedTop = new Set(['schemaVersion', 'releaseId', 'guideName', 'intro', 'features', 'outro']);
  for (const key of Object.keys(content)) {
    if (!allowedTop.has(key)) errors.push(`${key}: unknown top-level field`);
  }

  if (content.schemaVersion !== 1) {
    errors.push('schemaVersion: must be exactly 1');
  }

  if (typeof content.releaseId !== 'string' || !RELEASE_ID_RE.test(content.releaseId.trim())) {
    errors.push('releaseId: must be lowercase, filesystem-safe (^[a-z0-9][a-z0-9._-]*$)');
  }

  checkPlainText(content.guideName, 'guideName', errors);
  checkSection(content.intro, 'intro', errors);
  checkSection(content.outro, 'outro', errors);

  const imageAssets = [];
  let noMediaCount = 0;
  let videoCount = 0;

  if (!Array.isArray(content.features) || content.features.length === 0) {
    errors.push('features: must be a non-empty array');
  } else {
    const seenIds = new Set();
    content.features.forEach((feature, i) => {
      const label = `features[${i}]`;
      if (!isPlainObject(feature)) {
        errors.push(`${label}: must be an object`);
        return;
      }
      const allowed = new Set(['id', 'title', 'description', 'media']);
      for (const key of Object.keys(feature)) {
        if (!allowed.has(key)) errors.push(`${label}.${key}: unknown field`);
      }

      if (typeof feature.id !== 'string' || !FEATURE_ID_RE.test(feature.id.trim())) {
        errors.push(`${label}.id: must be lowercase alphanumeric with hyphens/underscores`);
      } else if (seenIds.has(feature.id)) {
        errors.push(`${label}.id: duplicate feature id "${feature.id}"`);
      } else {
        seenIds.add(feature.id);
      }

      checkPlainText(feature.title, `${label}.title`, errors);
      checkPlainText(feature.description, `${label}.description`, errors);

      const media = feature.media;
      if (!isPlainObject(media) || !['none', 'image', 'video'].includes(media.type)) {
        errors.push(`${label}.media.type: must be one of "none", "image", "video"`);
        return;
      }

      if (media.type === 'none') {
        const extra = Object.keys(media).filter((k) => k !== 'type');
        if (extra.length > 0) errors.push(`${label}.media: type "none" must not have additional fields (${extra.join(', ')})`);
        noMediaCount++;
      } else if (media.type === 'image') {
        const extra = Object.keys(media).filter((k) => !['type', 'path', 'alt'].includes(k));
        if (extra.length > 0) errors.push(`${label}.media: unknown field(s) ${extra.join(', ')}`);
        if (typeof media.path !== 'string' || media.path.trim().length === 0) {
          errors.push(`${label}.media.path: must be a non-empty string`);
        }
        checkPlainText(media.alt, `${label}.media.alt`, errors);
        if (typeof media.path === 'string' && media.path.trim().length > 0) {
          const result = validateImageAsset(manifestDir, media.path, errors, warnings, feature.id ?? i);
          if (result) imageAssets.push({ featureId: feature.id, featureIndex: i, ...result });
        }
      } else if (media.type === 'video') {
        const extra = Object.keys(media).filter((k) => !['type', 'url', 'title'].includes(k));
        if (extra.length > 0) errors.push(`${label}.media: unknown field(s) ${extra.join(', ')}`);
        try {
          if (typeof media.url !== 'string') throw new Error();
          new URL(media.url);
        } catch {
          errors.push(`${label}.media.url: must be a valid URL`);
        }
        if (media.title !== undefined) checkPlainText(media.title, `${label}.media.title`, errors);
        videoCount++;
      }
    });
  }

  if (errors.length > 0) {
    console.log(JSON.stringify({ valid: false, errors, warnings, derived: null }, null, 2));
    process.exit(1);
  }

  const featureCount = content.features.length;
  const derived = {
    generatedGuideName: `[AUTO][${content.releaseId}] ${content.guideName}`,
    featureCount,
    expectedSteps: featureCount + 2,
    noMediaCount,
    imageCount: imageAssets.length,
    videoCount,
    imageAssets,
  };

  console.log(JSON.stringify({ valid: true, errors: [], warnings, derived }, null, 2));
}

main();
