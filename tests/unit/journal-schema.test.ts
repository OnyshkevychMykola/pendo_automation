import { describe, it, expect } from 'vitest';
import { runJournalSchema, hasCompletedPhase, orderedPhases, type RunJournal } from '../../src/state/run-journal-schema.js';

const baseJournal: RunJournal = {
  schemaVersion: 1,
  releaseId: 'test-release',
  manifestPath: '/path/to/release.json',
  manifestSha256: 'abc123',
  generatedGuideName: '[AUTO][test-release] Test',
  targetAppName: 'TestApp',
  templateGuideName: '[TEMPLATE][RELEASE-NOTES-v1][DO NOT EDIT]',
  templateVersion: 1,
  status: 'running',
  completedFeatureIndexes: [],
  createdAt: '2026-08-17T00:00:00.000Z',
  updatedAt: '2026-08-17T00:00:00.000Z',
};

describe('runJournalSchema', () => {
  it('accepts valid journal', () => {
    expect(runJournalSchema.safeParse(baseJournal).success).toBe(true);
  });

  it('rejects unknown fields', () => {
    expect(runJournalSchema.safeParse({ ...baseJournal, extra: 'nope' }).success).toBe(false);
  });

  it('rejects invalid status', () => {
    expect(runJournalSchema.safeParse({ ...baseJournal, status: 'unknown' }).success).toBe(false);
  });
});

describe('hasCompletedPhase', () => {
  it('returns false when no phase completed', () => {
    expect(hasCompletedPhase(baseJournal, 'cloned')).toBe(false);
  });

  it('returns true for completed and earlier phases', () => {
    const j: RunJournal = { ...baseJournal, lastCompletedPhase: 'text-populated' };
    expect(hasCompletedPhase(j, 'cloned')).toBe(true);
    expect(hasCompletedPhase(j, 'steps-shaped')).toBe(true);
    expect(hasCompletedPhase(j, 'text-populated')).toBe(true);
    expect(hasCompletedPhase(j, 'media-populated')).toBe(false);
    expect(hasCompletedPhase(j, 'saved')).toBe(false);
  });

  it('ordered phases are in correct sequence', () => {
    expect(orderedPhases[0]).toBe('cloned');
    expect(orderedPhases[orderedPhases.length - 1]).toBe('verified');
  });
});
