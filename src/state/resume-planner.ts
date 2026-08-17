import type { RunJournal } from './run-journal-schema.js';
import type { ValidatedManifest } from '../manifest/manifest-validator.js';
import { AutomationError } from '../errors/automation-error.js';
import { ErrorCode } from '../errors/error-codes.js';

export interface ResumePlan {
  mode: 'create' | 'resume';
  guideUrl?: string;
}

export function planRun(opts: {
  resume: boolean;
  journalExists: boolean;
  journal?: RunJournal;
  validated: ValidatedManifest;
  targetAppName: string;
  templateGuideName: string;
  templateVersion: number;
}): ResumePlan {
  const { resume, journalExists, journal, validated } = opts;

  if (!resume && !journalExists) {
    return { mode: 'create' };
  }

  if (resume && !journalExists) {
    throw new AutomationError({
      code: ErrorCode.RESUME_WITHOUT_JOURNAL,
      message: `--resume was specified but no journal exists for release: ${validated.manifest.releaseId}`,
      releaseId: validated.manifest.releaseId,
    });
  }

  if (!resume && journalExists && journal?.status === 'completed') {
    // Idempotent: completed journal without --resume → return existing guide URL
    return { mode: 'resume', guideUrl: journal.guideUrl };
  }

  if (!resume && journalExists) {
    throw new AutomationError({
      code: ErrorCode.JOURNAL_MISMATCH,
      message: `An incomplete journal exists for release "${validated.manifest.releaseId}". Use --resume to continue or investigate artifacts at the journal path.`,
      releaseId: validated.manifest.releaseId,
      resumable: true,
    });
  }

  // --resume with existing journal
  if (!journal) {
    throw new AutomationError({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Journal expected but not provided',
    });
  }

  validateResumeCompatibility(journal, validated, opts.targetAppName, opts.templateGuideName, opts.templateVersion);

  return { mode: 'resume', guideUrl: journal.guideUrl };
}

function validateResumeCompatibility(
  journal: RunJournal,
  validated: ValidatedManifest,
  targetAppName: string,
  templateGuideName: string,
  templateVersion: number,
): void {
  if (journal.releaseId !== validated.manifest.releaseId) {
    throw new AutomationError({
      code: ErrorCode.JOURNAL_MISMATCH,
      message: `Journal release ID "${journal.releaseId}" does not match manifest "${validated.manifest.releaseId}"`,
      releaseId: validated.manifest.releaseId,
    });
  }

  if (journal.manifestSha256 !== validated.manifestHash) {
    throw new AutomationError({
      code: ErrorCode.RESUME_MANIFEST_HASH_MISMATCH,
      message: `Manifest has changed since last run. Cannot resume with different content.`,
      releaseId: validated.manifest.releaseId,
    });
  }

  if (journal.generatedGuideName !== validated.generatedGuideName) {
    throw new AutomationError({
      code: ErrorCode.JOURNAL_MISMATCH,
      message: `Journal guide name "${journal.generatedGuideName}" does not match expected "${validated.generatedGuideName}"`,
      releaseId: validated.manifest.releaseId,
    });
  }

  if (journal.targetAppName !== targetAppName) {
    throw new AutomationError({
      code: ErrorCode.JOURNAL_MISMATCH,
      message: `Journal target app "${journal.targetAppName}" does not match config "${targetAppName}"`,
      releaseId: validated.manifest.releaseId,
    });
  }

  if (journal.templateVersion !== templateVersion) {
    throw new AutomationError({
      code: ErrorCode.JOURNAL_MISMATCH,
      message: `Journal template version ${journal.templateVersion} does not match config ${templateVersion}`,
      releaseId: validated.manifest.releaseId,
    });
  }

  if (!journal.guideUrl) {
    throw new AutomationError({
      code: ErrorCode.RESUME_GUIDE_NOT_FOUND,
      message: `Journal for release "${validated.manifest.releaseId}" has no guide URL. Cannot resume.`,
      releaseId: validated.manifest.releaseId,
    });
  }
}
