import type { ResolvedConfig } from '../config/resolved-config.js';
import type { ValidatedManifest } from '../manifest/manifest-validator.js';
import type { Logger } from '../observability/logger.js';
import type { ArtifactManager } from '../observability/artifact-manager.js';
import type { RunJournalStore } from '../state/run-journal-store.js';
import type { BrowserManager } from '../browser/browser-manager.js';

export interface WorkflowOptions {
  resume: boolean;
  slow: boolean;
  debug: boolean;
  keepBrowserOpen: boolean;
}

export interface WorkflowContext {
  config: ResolvedConfig;
  validated: ValidatedManifest;
  options: WorkflowOptions;
  logger: Logger;
  artifacts: ArtifactManager;
  journal: RunJournalStore;
  browser: BrowserManager;
}
