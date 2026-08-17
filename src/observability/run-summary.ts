import type { ValidatedManifest } from '../manifest/manifest-validator.js';

export interface RunSummary {
  releaseId: string;
  manifestHash: string;
  generatedGuideName: string;
  guideUrl: string;
  targetAppName: string;
  templateVersion: number;
  featureCount: number;
  expectedStepCount: number;
  actualStepCount: number;
  imageCount: number;
  noMediaCount: number;
  draftStatus: boolean;
  verificationPassed: boolean;
  startedAt: string;
  completedAt: string;
  artifactDirectory: string;
}

export function buildSummaryMarkdown(s: RunSummary): string {
  return `# Release Guide Creation Summary

- **Release ID:** ${s.releaseId}
- **Guide name:** ${s.generatedGuideName}
- **Guide URL:** ${s.guideUrl}
- **Target app:** ${s.targetAppName}
- **Template version:** ${s.templateVersion}
- **Features:** ${s.featureCount} (${s.imageCount} with image, ${s.noMediaCount} no-media)
- **Steps:** ${s.actualStepCount} / expected ${s.expectedStepCount}
- **Status:** ${s.draftStatus ? 'Draft' : '⚠️ NOT DRAFT'}
- **Verification:** ${s.verificationPassed ? 'passed' : '⚠️ FAILED'}
- **Started:** ${s.startedAt}
- **Completed:** ${s.completedAt}
- **Artifacts:** ${s.artifactDirectory}
`;
}

export function buildSuccessConsoleOutput(s: RunSummary): string {
  return [
    `Release ID:  ${s.releaseId}`,
    `Guide name:  ${s.generatedGuideName}`,
    `Features:    ${s.featureCount}`,
    `Steps:       ${s.actualStepCount}`,
    `Status:      Draft`,
    `Verification: passed`,
    `Guide URL:   ${s.guideUrl}`,
    `Artifacts:   ${s.artifactDirectory}`,
  ].join('\n');
}

export function summaryFromValidated(
  validated: ValidatedManifest,
  targetAppName: string,
  templateVersion: number,
): Partial<RunSummary> {
  return {
    releaseId: validated.manifest.releaseId,
    manifestHash: validated.manifestHash,
    generatedGuideName: validated.generatedGuideName,
    targetAppName,
    templateVersion,
    featureCount: validated.featureCount,
    expectedStepCount: validated.expectedSteps,
    imageCount: validated.imageAssets.length,
    noMediaCount: validated.noMediaCount,
  };
}
