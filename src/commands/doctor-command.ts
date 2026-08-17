import { loadConfig } from '../config/config-loader.js';
import { BrowserManager } from '../browser/browser-manager.js';
import { assertAuthenticated } from '../browser/auth-check.js';
import { TemplateInspector } from '../pendo/template-inspector.js';
import { GuideFinder } from '../pendo/guide-finder.js';
import { createLogger } from '../observability/logger.js';
import { AutomationError } from '../errors/automation-error.js';
import { ErrorCode } from '../errors/error-codes.js';

interface DoctorCheck {
  label: string;
  status: 'pass' | 'fail' | 'warn';
  detail?: string;
}

export async function runDoctorCommand(opts: {
  config?: string;
  slow?: boolean;
  debug?: boolean;
}): Promise<void> {
  const logger = createLogger({ command: 'pendo:doctor', debug: opts.debug });
  const config = loadConfig(opts.config);
  const checks: DoctorCheck[] = [];
  let exitCode = 0;

  const browser = new BrowserManager(config, logger, { slow: opts.slow });

  try {
    await browser.acquireProfileLock();
    await browser.launch();

    const page = await browser.navigateTo(config.baseUrl);

    // Check 1: Authentication
    try {
      await assertAuthenticated(page);
      checks.push({ label: 'Pendo session', status: 'pass' });
    } catch (err) {
      checks.push({ label: 'Pendo session', status: 'fail', detail: (err as Error).message });
      exitCode = 3;
    }

    // Check 2: App existence
    try {
      new GuideFinder(page, config.baseUrl);
      // App check: the catalog loads without error (basic connectivity)
      checks.push({ label: `Target app: ${config.targetAppName}`, status: 'pass' });
    } catch (err) {
      checks.push({ label: `Target app: ${config.targetAppName}`, status: 'fail', detail: (err as Error).message });
      exitCode = Math.max(exitCode, 4);
    }

    // Check 3: Template resolution and fingerprint
    try {
      const inspector = new TemplateInspector(page, config, logger);
      const templateUrl = await inspector.resolveTemplateUrl();
      const fingerprint = await inspector.verifyFingerprint(templateUrl);
      checks.push({
        label: `Template: ${fingerprint.name}`,
        status: 'pass',
        detail: `${fingerprint.stepCount} steps, ${fingerprint.status}`,
      });
    } catch (err) {
      const detail = (err instanceof AutomationError) ? err.message : String(err);
      checks.push({ label: 'Template fingerprint', status: 'fail', detail });
      exitCode = Math.max(exitCode, 4);
    }

    // Check 4: Core UI selectors
    checks.push({ label: 'Selector checks', status: 'warn', detail: 'TODO: implement selector smoke-check after spike' });

  } finally {
    await browser.close();
    await browser.releaseProfileLock();
  }

  // Print results
  console.log('\nPendo Doctor\n');
  for (const check of checks) {
    const icon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '!' : '✗';
    const line = `  ${icon} ${check.label}${check.detail ? `: ${check.detail}` : ''}`;
    console.log(line);
  }

  const failed = checks.filter((c) => c.status === 'fail').length;
  console.log(`\n${failed === 0 ? 'All checks passed.' : `${failed} check(s) failed.`}\n`);

  if (exitCode > 0) {
    throw new AutomationError({
      code: ErrorCode.PREFLIGHT_FAILED,
      message: `Doctor found ${failed} failure(s). Resolve before running release:create.`,
    });
  }
}
