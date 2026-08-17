import fs from 'node:fs';
import path from 'node:path';
import { runJournalSchema, hasCompletedPhase, type RunJournal, type RunPhase } from './run-journal-schema.js';
import { writeJsonAtomic, readJsonFile } from '../util/atomic-file.js';
import { AutomationError } from '../errors/automation-error.js';
import { ErrorCode } from '../errors/error-codes.js';
import type { SerializedError } from '../errors/error-serializer.js';

export class RunJournalStore {
  private journal: RunJournal | null = null;

  constructor(
    private readonly stateRoot: string,
    private readonly releaseId: string,
  ) {}

  get journalPath(): string {
    return path.join(this.stateRoot, 'run-journal', `${this.releaseId}.json`);
  }

  exists(): boolean {
    return fs.existsSync(this.journalPath);
  }

  load(): RunJournal {
    if (!this.exists()) {
      throw new AutomationError({
        code: ErrorCode.JOURNAL_NOT_FOUND,
        message: `No journal found for release: ${this.releaseId}`,
        releaseId: this.releaseId,
      });
    }
    const raw = readJsonFile(this.journalPath);
    const result = runJournalSchema.safeParse(raw);
    if (!result.success) {
      throw new AutomationError({
        code: ErrorCode.JOURNAL_MISMATCH,
        message: `Journal is corrupt or has an incompatible schema: ${this.journalPath}`,
        releaseId: this.releaseId,
      });
    }
    this.journal = result.data;
    return this.journal;
  }

  create(opts: {
    manifestPath: string;
    manifestSha256: string;
    generatedGuideName: string;
    targetAppName: string;
    templateGuideName: string;
    templateVersion: number;
    templateUrl?: string;
  }): RunJournal {
    const now = new Date().toISOString();
    const journal: RunJournal = {
      schemaVersion: 1,
      releaseId: this.releaseId,
      manifestPath: opts.manifestPath,
      manifestSha256: opts.manifestSha256,
      generatedGuideName: opts.generatedGuideName,
      targetAppName: opts.targetAppName,
      templateGuideName: opts.templateGuideName,
      templateVersion: opts.templateVersion,
      templateUrl: opts.templateUrl,
      status: 'running',
      completedFeatureIndexes: [],
      createdAt: now,
      updatedAt: now,
    };
    this.save(journal);
    this.journal = journal;
    return journal;
  }

  current(): RunJournal {
    if (!this.journal) throw new Error('Journal not loaded or created');
    return this.journal;
  }

  requireGuideUrl(): string {
    const url = this.current().guideUrl;
    if (!url) {
      throw new AutomationError({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Guide URL not yet recorded in journal',
        releaseId: this.releaseId,
      });
    }
    return url;
  }

  recordClone(opts: { guideUrl: string; guideId?: string }): void {
    this.update({ guideUrl: opts.guideUrl, guideId: opts.guideId });
  }

  completePhase(phase: RunPhase): void {
    this.update({ lastCompletedPhase: phase });
  }

  completeFeature(index: number): void {
    const j = this.current();
    if (!j.completedFeatureIndexes.includes(index)) {
      this.update({ completedFeatureIndexes: [...j.completedFeatureIndexes, index] });
    }
  }

  hasCompleted(phase: RunPhase): boolean {
    return hasCompletedPhase(this.current(), phase);
  }

  isFeatureComplete(index: number): boolean {
    return this.current().completedFeatureIndexes.includes(index);
  }

  markCompleted(): void {
    this.update({ status: 'completed' });
  }

  recordFailure(err: SerializedError): void {
    this.update({
      status: 'failed',
      lastError: {
        code: err.code,
        phase: err.phase ?? 'preflight',
        message: err.message,
        artifactDirectory: '',
      },
    });
  }

  private update(patch: Partial<RunJournal>): void {
    const current = this.current();
    const updated: RunJournal = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    const parsed = runJournalSchema.parse(updated);
    this.save(parsed);
    this.journal = parsed;
  }

  private save(journal: RunJournal): void {
    writeJsonAtomic(this.journalPath, journal);
  }
}
