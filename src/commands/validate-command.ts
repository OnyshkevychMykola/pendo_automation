import path from 'node:path';
import { loadManifest } from '../manifest/manifest-loader.js';
import { validateManifest } from '../manifest/manifest-validator.js';
import { loadConfig } from '../config/config-loader.js';
import { createLogger } from '../observability/logger.js';

export async function runValidateCommand(manifestPath: string, opts: { config?: string }): Promise<void> {
  const logger = createLogger({ command: 'release:validate' });
  const config = loadConfig(opts.config);
  const { manifest, manifestDir } = loadManifest(manifestPath);
  const validated = validateManifest(manifest, manifestPath, manifestDir);

  for (const warn of validated.warnings) {
    logger.warn(warn);
  }

  const lines = [
    `Manifest path:    ${path.resolve(manifestPath)}`,
    `Release ID:       ${validated.manifest.releaseId}`,
    `Guide name:       ${validated.generatedGuideName}`,
    `Features:         ${validated.featureCount} (${validated.imageAssets.length} with image, ${validated.manifest.features.filter((f) => f.media.type === 'video').length} with video, ${validated.noMediaCount} no-media)`,
    `Expected steps:   ${validated.expectedSteps}`,
    `Manifest hash:    ${validated.manifestHash}`,
    `Target app:       ${config.targetAppName}`,
  ];

  console.log('\n' + lines.join('\n') + '\n');
}
