import { z } from 'zod';

export const orderedPhases = [
  'cloned',
  'steps-shaped',
  'text-populated',
  'media-populated',
  'saved',
  'verified',
] as const;

export type RunPhase = (typeof orderedPhases)[number];
export type RunStatus = 'running' | 'failed' | 'completed';

export const journalErrorSchema = z.object({
  code: z.string(),
  phase: z.string(),
  message: z.string(),
  artifactDirectory: z.string(),
});

export const runJournalSchema = z
  .object({
    schemaVersion: z.literal(1),
    releaseId: z.string(),
    manifestPath: z.string(),
    manifestSha256: z.string(),
    generatedGuideName: z.string(),
    targetAppName: z.string(),
    templateGuideName: z.string(),
    templateVersion: z.number(),
    templateUrl: z.string().optional(),
    guideUrl: z.string().optional(),
    guideId: z.string().optional(),
    status: z.enum(['running', 'failed', 'completed']),
    lastCompletedPhase: z.enum(orderedPhases).optional(),
    completedFeatureIndexes: z.array(z.number().int().min(0)),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    lastError: journalErrorSchema.optional(),
  })
  .strict();

export type RunJournal = z.output<typeof runJournalSchema>;

export function phaseIndex(phase: RunPhase): number {
  return orderedPhases.indexOf(phase);
}

export function hasCompletedPhase(journal: RunJournal, phase: RunPhase): boolean {
  if (!journal.lastCompletedPhase) return false;
  return phaseIndex(journal.lastCompletedPhase) >= phaseIndex(phase);
}

export function nextPhaseAfter(phase: RunPhase): RunPhase | null {
  const idx = phaseIndex(phase);
  return orderedPhases[idx + 1] ?? null;
}
