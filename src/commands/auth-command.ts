import { loadConfig } from '../config/config-loader.js';
import { BrowserManager } from '../browser/browser-manager.js';
import { detectAuthState } from '../browser/auth-check.js';
import { getProfileDir } from '../browser/profile-paths.js';
import { createLogger } from '../observability/logger.js';

export async function runAuthCommand(opts: {
  config?: string;
  slow?: boolean;
  debug?: boolean;
}): Promise<void> {
  const logger = createLogger({ command: 'pendo:auth', debug: opts.debug });
  const config = loadConfig(opts.config);
  const browser = new BrowserManager(config, logger, { slow: opts.slow, keepOpen: true });

  logger.info({ profileDir: getProfileDir() }, 'Opening browser for manual authentication');
  logger.info('Complete sign-in, MFA, and SSO in the browser window. Close the window when done.');

  await browser.acquireProfileLock();
  await browser.launch();

  try {
    const page = await browser.navigateTo(config.baseUrl);

    // Poll for authentication state until the browser is closed
    let lastState = await detectAuthState(page);
    logger.info({ authState: lastState }, 'Initial auth state');

    const poll = setInterval(async () => {
      try {
        const state = await detectAuthState(page);
        if (state !== lastState) {
          lastState = state;
          logger.info({ authState: state }, 'Auth state changed');
        }
      } catch { /* browser may be closing */ }
    }, 3000);

    // Wait for browser close
    await browser.ctx().waitForEvent('close').catch(() => {});
    clearInterval(poll);

    if (lastState === 'authenticated') {
      logger.info('Authentication saved to profile. Run `npm run pendo:doctor` to verify setup.');
    } else {
      logger.warn({ authState: lastState }, 'Browser closed without confirmed authentication');
    }
  } finally {
    await browser.releaseProfileLock();
  }
}
