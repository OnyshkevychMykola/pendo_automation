import type { WorkflowContext } from './workflow-context.js';
import type { RunSummary } from '../observability/run-summary.js';
import { planRun } from '../state/resume-planner.js';
import { assertAuthenticated } from '../browser/auth-check.js';
import { GuideFinder } from '../pendo/guide-finder.js';
import { TemplateInspector } from '../pendo/template-inspector.js';
import { GuideDetailsPage } from '../pendo/pages/guide-details-page.js';
import { VisualDesignStudioPage } from '../pendo/pages/visual-design-studio-page.js';
import { computeStepMapping } from '../pendo/pages/step-list-component.js';
import { GuideVerifier } from '../pendo/guide-verifier.js';
import { serializeError } from '../errors/error-serializer.js';
import { buildSuccessConsoleOutput, buildSummaryMarkdown } from '../observability/run-summary.js';

export async function createReleaseGuide(ctx: WorkflowContext): Promise<RunSummary> {
  const { config, validated, options, logger, artifacts, journal, browser } = ctx;
  const { manifest } = validated;
  const startedAt = new Date().toISOString();

  await browser.acquireProfileLock();

  let releaseLockRelease: (() => Promise<void>) | null = null;
  try {
    const { acquireReleaseLock } = await import('../state/run-lock.js');
    releaseLockRelease = await acquireReleaseLock(config.paths.stateRoot, manifest.releaseId);

    // Phase 0: journal setup
    const journalExists = journal.exists();
    let journalData = journalExists ? journal.load() : undefined;

    const plan = planRun({
      resume: options.resume,
      journalExists,
      journal: journalData,
      validated,
      targetAppName: config.targetAppName,
      templateGuideName: config.templateGuideName,
      templateVersion: config.templateVersion,
    });

    // Idempotent completed run
    if (plan.mode === 'resume' && journalData?.status === 'completed' && plan.guideUrl) {
      logger.info('Previously completed run found. Returning existing guide URL.');
      return buildMinimalSummary(ctx, plan.guideUrl, startedAt);
    }

    if (!journalExists) {
      journalData = journal.create({
        manifestPath: validated.manifestPath,
        manifestSha256: validated.manifestHash,
        generatedGuideName: validated.generatedGuideName,
        targetAppName: config.targetAppName,
        templateGuideName: config.templateGuideName,
        templateVersion: config.templateVersion,
      });
    }

    // Phase 1: Browser launch and auth
    await browser.launch();
    await browser.startTracing(artifacts.tracePath());
    const page = await browser.navigateTo(config.baseUrl);
    await assertAuthenticated(page);
    logger.info('Authenticated Pendo session confirmed');

    // Phase 2: Preflight
    const inspector = new TemplateInspector(page, config, logger);
    const templateUrl = await inspector.resolveTemplateUrl();
    const fingerprint = await inspector.verifyFingerprint(templateUrl);
    logger.info({ templateName: fingerprint.name }, 'Template contract verified');

    const finder = new GuideFinder(page, config.baseUrl);

    // Phase 3: Duplicate check or resume validation
    if (plan.mode === 'create') {
      await finder.assertNoDuplicate(validated.generatedGuideName, manifest.releaseId);
    }

    // Phase 4: Clone (with name set in the clone dialog)
    let guideUrl: string;
    if (!journal.hasCompleted('cloned')) {
      await inspector.assertTemplateNotModified(templateUrl);
      const detailsPage = new GuideDetailsPage(page);
      await detailsPage.navigate(templateUrl);

      logger.info(`Cloning template as "${validated.generatedGuideName}"...`);
      const clonedUrl = await detailsPage.cloneWithName(validated.generatedGuideName);
      journal.recordClone({ guideUrl: clonedUrl });
      journal.completePhase('cloned');
      await artifacts.screenshot(page, 'cloned-guide');
      logger.info({ guideUrl: clonedUrl }, 'Cloned guide');
    }

    guideUrl = journal.requireGuideUrl();

    // Phase 5: Open Guide Editor (same tab via "Edit in Pendo")
    const detailsForEdit = new GuideDetailsPage(page);
    await detailsForEdit.navigate(guideUrl);
    await detailsForEdit.openGuideEditor();
    const studio = new VisualDesignStudioPage(page);
    await studio.assertOpen();

    // Phase 6: Shape steps — duplicate/delete the template's master steps (text/image/video)
    // to match each feature's media type. See StepListComponent.shapeFeatureSteps.
    if (!journal.hasCompleted('steps-shaped')) {
      logger.info(`Shaping ${validated.featureCount} feature steps...`);
      await studio.steps.shapeFeatureSteps(manifest.features);
      await studio.steps.assertStepCount(validated.expectedSteps, manifest.releaseId);
      journal.completePhase('steps-shaped');
      await artifacts.screenshot(page, 'steps-shaped');
      logger.info(`Shaped ${validated.expectedSteps} steps`);
    }

    // Phase 7: Populate text and media for each step. Step order is grouped by media type
    // (text-only, then image, then video) — see computeStepMapping.
    if (!journal.hasCompleted('text-populated')) {
      logger.info('Populating text and media...');
      const imagePathByFeatureId = new Map(validated.imageAssets.map((a) => [a.featureId, a.resolvedPath]));

      await studio.populateIntro(manifest.intro);
      for (const { stepIndex, feature } of computeStepMapping(manifest.features)) {
        await studio.populateFeature(stepIndex, feature, imagePathByFeatureId.get(feature.id));
      }
      await studio.populateOutro(manifest.outro, validated.expectedSteps);
      journal.completePhase('text-populated');
      logger.info(`Populated text and media for ${validated.featureCount} features`);
    }

    // Phase 8: kept for journal/resume compatibility — media is populated together with
    // text in phase 7 now that image/video blocks are directly editable in the Guide Editor.
    if (!journal.hasCompleted('media-populated')) {
      journal.completePhase('media-populated');
    }

    // Phase 9: Save and return to guide details
    if (!journal.hasCompleted('saved')) {
      logger.info('Saving Draft guide...');
      await studio.saveAndReturn();
      journal.completePhase('saved');
      await artifacts.screenshot(page, 'saved-draft');
      logger.info('Saved Draft guide');
    }

    // Phase 10: Verify
    const verifier = new GuideVerifier(page, config);
    await verifier.verifyDraftGuide(guideUrl, validated);
    journal.completePhase('verified');
    journal.markCompleted();
    logger.info('Verification passed');

    const completedAt = new Date().toISOString();
    const summary = buildMinimalSummary(ctx, guideUrl, startedAt, completedAt);
    artifacts.writeSnapshot('summary.json', summary);
    artifacts.writeMarkdown('summary.md', buildSummaryMarkdown(summary));
    console.log('\n' + buildSuccessConsoleOutput(summary));

    return summary;

  } catch (error) {
    const serialized = serializeError(error);

    try { journal.recordFailure(serialized); } catch { /* journal may not exist yet */ }

    try {
      const allPages = browser.pages().allPages();
      await artifacts.screenshotAllPages(allPages, 'failure-active-page');
      await browser.stopTracing(artifacts.tracePath());
    } catch { /* browser may not have been launched */ }

    logger.error({ error: serialized }, `Run failed: ${serialized.message}`);
    if (serialized.resumable) {
      logger.error('This failure may be recoverable. Use --resume after resolving the issue.');
    }

    throw error;
  } finally {
    await browser.close();
    await browser.releaseProfileLock();
    try { await releaseLockRelease?.(); } catch { /* ignore */ }
  }
}

function buildMinimalSummary(
  ctx: WorkflowContext,
  guideUrl: string,
  startedAt: string,
  completedAt?: string,
): RunSummary {
  return {
    releaseId: ctx.validated.manifest.releaseId,
    manifestHash: ctx.validated.manifestHash,
    generatedGuideName: ctx.validated.generatedGuideName,
    guideUrl,
    targetAppName: ctx.config.targetAppName,
    templateVersion: ctx.config.templateVersion,
    featureCount: ctx.validated.featureCount,
    expectedStepCount: ctx.validated.expectedSteps,
    actualStepCount: ctx.validated.expectedSteps,
    imageCount: ctx.validated.imageAssets.length,
    noMediaCount: ctx.validated.noMediaCount,
    draftStatus: true,
    verificationPassed: true,
    startedAt,
    completedAt: completedAt ?? new Date().toISOString(),
    artifactDirectory: ctx.artifacts.runDir,
  };
}
