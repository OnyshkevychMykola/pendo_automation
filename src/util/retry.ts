export type RetryableOperation = 'read-only-navigation' | 'auth-check' | 'table-read' | 'stale-locator';

interface RetryOptions {
  operation: RetryableOperation;
  maxAttempts?: number;
  delayMs?: number;
}

/**
 * Limited retry only for read-only, non-mutating operations.
 * Mutation operations (clone, rename, upload, save) must NEVER use this.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const delayMs = opts.delayMs ?? 1000;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await sleep(delayMs * attempt);
      }
    }
  }

  throw lastError;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
