import path from 'node:path';
import lockfile from 'proper-lockfile';
import fs from 'node:fs';
import { AutomationError } from '../errors/automation-error.js';
import { ErrorCode } from '../errors/error-codes.js';

async function acquireLock(filePath: string, errorCode: ErrorCode, description: string): Promise<() => Promise<void>> {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  // proper-lockfile requires the file to exist
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '');
  }

  try {
    const release = await lockfile.lock(filePath, {
      retries: { retries: 2, minTimeout: 500, maxTimeout: 1000 },
    });
    return release;
  } catch {
    throw new AutomationError({
      code: errorCode,
      message: `Cannot acquire ${description} lock: ${filePath}. Another process may be running.`,
    });
  }
}

export function releaseLockPath(stateRoot: string, releaseId: string): string {
  return path.join(stateRoot, 'locks', `release-${releaseId}.lock`);
}

export async function acquireReleaseLock(
  stateRoot: string,
  releaseId: string,
): Promise<() => Promise<void>> {
  return acquireLock(
    releaseLockPath(stateRoot, releaseId),
    ErrorCode.RELEASE_LOCK_CONFLICT,
    `release (${releaseId})`,
  );
}

export async function acquireProfileLock(profileDir: string): Promise<() => Promise<void>> {
  const lockPath = path.join(profileDir, '.profile.lock');
  return acquireLock(lockPath, ErrorCode.PROFILE_LOCK_CONFLICT, 'browser profile');
}
