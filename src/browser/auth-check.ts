import type { Page } from 'playwright';

export type AuthState =
  | 'authenticated'
  | 'login-required'
  | 'mfa-in-progress'
  | 'access-denied'
  | 'unavailable';

/**
 * Detect authentication state from the current Pendo page.
 * Confirmed patterns from spike on 2026-08-17.
 */
export async function detectAuthState(page: Page): Promise<AuthState> {
  let url = page.url();

  if (!url.startsWith('http')) return 'unavailable';

  // Auth0 or Pendo login page
  if (
    url.includes('auth0.com/u/login') ||
    url.includes('app.pendo.io/login') ||
    url.includes('/signin')
  ) {
    return 'login-required';
  }

  // Access denied
  if (url.includes('/access-denied') || url.includes('/403')) {
    return 'access-denied';
  }

  // MFA / 2FA flow
  if (url.includes('/mfa') || url.includes('/two-factor')) {
    return 'mfa-in-progress';
  }

  if (!url.includes('app.pendo.io')) return 'unavailable';

  // Pendo uses a JS redirect from app.pendo.io → /s/{subscriptionId}/...
  // Wait up to 8s for that redirect to complete before reading the final URL.
  if (/^https:\/\/app\.pendo\.io\/?$/.test(url)) {
    await page
      .waitForURL((u) => !/^https:\/\/app\.pendo\.io\/?$/.test(u.toString()), { timeout: 8000 })
      .catch(() => {});
    url = page.url();
  }

  // Authenticated: redirected to /s/{subscriptionId}/...
  if (/\/s\/\d+\//.test(url)) return 'authenticated';

  // Fallback DOM check
  const hasShell = (await page.locator('[data-cy="top-nav"]').count()) > 0;
  return hasShell ? 'authenticated' : 'login-required';
}

export async function assertAuthenticated(page: Page): Promise<void> {
  const state = await detectAuthState(page);
  if (state === 'authenticated') return;

  const messages: Record<AuthState, string> = {
    authenticated: '',
    'login-required': 'Pendo session not found. Run `npm run pendo:auth` to sign in.',
    'mfa-in-progress': 'MFA flow in progress. Run `npm run pendo:auth` to complete authentication.',
    'access-denied': 'Access denied to Pendo. Check your account permissions.',
    unavailable: 'Pendo is unavailable. Check your network connection.',
  };

  throw Object.assign(new Error(messages[state]), { authState: state });
}
