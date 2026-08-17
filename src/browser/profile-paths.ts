import envPaths from 'env-paths';
import path from 'node:path';

const APP_NAME = 'pendo-release-automation';

export function getProfileDir(): string {
  const paths = envPaths(APP_NAME, { suffix: '' });
  return path.join(paths.data, 'browser-profile');
}
