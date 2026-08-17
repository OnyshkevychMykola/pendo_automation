import type { ReleaseManifest } from './manifest-schema.js';

export function generateGuideName(manifest: Pick<ReleaseManifest, 'releaseId' | 'guideName'>): string {
  return `[AUTO][${manifest.releaseId}] ${manifest.guideName}`;
}

export function expectedStepCount(featureCount: number): number {
  return featureCount + 2;
}
