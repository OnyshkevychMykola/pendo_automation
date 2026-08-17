import path from 'node:path';
import type { ReleaseManifest } from './manifest-schema.js';
import { validateImageAsset, type AssetValidationResult } from './asset-validator.js';
import { generateGuideName, expectedStepCount } from './name-generator.js';
import { sha256String } from '../util/hashing.js';

export interface ImageAssetInfo extends AssetValidationResult {
  featureId: string;
  featureIndex: number;
}

export interface ValidatedManifest {
  manifest: ReleaseManifest;
  manifestPath: string;
  manifestDir: string;
  manifestHash: string;
  generatedGuideName: string;
  featureCount: number;
  expectedSteps: number;
  imageAssets: ImageAssetInfo[];
  noMediaCount: number;
  warnings: string[];
}

export function validateManifest(
  manifest: ReleaseManifest,
  manifestPath: string,
  manifestDir: string,
): ValidatedManifest {
  const warnings: string[] = [];
  const imageAssets: ImageAssetInfo[] = [];

  for (const [i, feature] of manifest.features.entries()) {
    if (feature.media.type === 'image') {
      const result = validateImageAsset(manifestDir, feature.media.path);
      if (result.warn) warnings.push(result.warn);
      imageAssets.push({ ...result, featureId: feature.id, featureIndex: i });
    }
  }

  const noMediaCount = manifest.features.filter((f) => f.media.type === 'none').length;
  const manifestHash = sha256String(
    JSON.stringify({
      manifest,
      imageSizes: imageAssets.map((a) => ({ path: a.resolvedPath, size: a.sizeBytes })),
    }),
  );

  return {
    manifest,
    manifestPath: path.resolve(manifestPath),
    manifestDir,
    manifestHash,
    generatedGuideName: generateGuideName(manifest),
    featureCount: manifest.features.length,
    expectedSteps: expectedStepCount(manifest.features.length),
    imageAssets,
    noMediaCount,
    warnings,
  };
}
