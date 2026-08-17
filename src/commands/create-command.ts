import { loadConfig } from '../config/config-loader.js';
import { loadManifest } from '../manifest/manifest-loader.js';
import { validateManifest } from '../manifest/manifest-validator.js';
import { BrowserManager } from '../browser/browser-manager.js';
import { ArtifactManager } from '../observability/artifact-manager.js';
import { RunJournalStore } from '../state/run-journal-store.js';
import { createLogger } from '../observability/logger.js';
import { createReleaseGuide } from '../workflow/release-orchestrator.js';
import { exitCodeFromError } from '../errors/error-serializer.js';

export async function runCreateCommand(
  manifestPath: string,
  opts: {
    config?: string;
    resume?: boolean;
    slow?: boolean;
    debug?: boolean;
    keepBrowserOpen?: boolean;
  },
): Promise<void> {
  const config = loadConfig(opts.config);
  const { manifest, manifestDir } = loadManifest(manifestPath);
  const validated = validateManifest(manifest, manifestPath, manifestDir);

  const logger = createLogger({
    command: 'release:create',
    releaseId: validated.manifest.releaseId,
    debug: opts.debug,
    logFile: undefined, // ArtifactManager sets this after runDir is known
  });

  for (const warn of validated.warnings) {
    logger.warn(warn);
  }

  logger.info(`Validated release ${validated.manifest.releaseId}: ${validated.featureCount} features, ${validated.expectedSteps} expected steps`);

  const artifacts = new ArtifactManager(config.paths.artifactsRoot, validated.manifest.releaseId, logger);
  artifacts.writeSnapshot('manifest.snapshot.json', manifest);
  artifacts.writeSnapshot('config.snapshot.json', {
    ...config,
    templateGuideUrl: config.templateGuideUrl ? '<redacted>' : '',
  });

  const journal = new RunJournalStore(config.paths.stateRoot, validated.manifest.releaseId);
  const browser = new BrowserManager(config, logger, {
    slow: opts.slow,
    keepOpen: opts.keepBrowserOpen,
  });

  try {
    await createReleaseGuide({
      config,
      validated,
      options: {
        resume: opts.resume ?? false,
        slow: opts.slow ?? false,
        debug: opts.debug ?? false,
        keepBrowserOpen: opts.keepBrowserOpen ?? false,
      },
      logger,
      artifacts,
      journal,
      browser,
    });
  } catch (err) {
    process.exitCode = exitCodeFromError(err);
    throw err;
  }
}
