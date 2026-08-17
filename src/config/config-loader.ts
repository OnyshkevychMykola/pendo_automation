import fs from 'node:fs';
import path from 'node:path';
import { automationConfigSchema } from './config-schema.js';
import type { ResolvedConfig } from './resolved-config.js';
import { AutomationError } from '../errors/automation-error.js';
import { ErrorCode } from '../errors/error-codes.js';

const CONFIG_FILE = 'pendo-automation.config.json';
const ENV_VAR = 'PENDO_AUTOMATION_CONFIG';

function findConfigPath(explicit?: string): string {
  if (explicit) return path.resolve(explicit);

  const fromEnv = process.env[ENV_VAR];
  if (fromEnv) return path.resolve(fromEnv);

  const local = path.resolve(process.cwd(), CONFIG_FILE);
  if (fs.existsSync(local)) return local;

  throw new AutomationError({
    code: ErrorCode.CONFIG_INVALID,
    message: `No config found. Create ${CONFIG_FILE} or set ${ENV_VAR}.`,
  });
}

export function loadConfig(explicit?: string): ResolvedConfig {
  const configPath = findConfigPath(explicit);

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    throw new AutomationError({
      code: ErrorCode.CONFIG_INVALID,
      message: `Cannot read config file: ${configPath}`,
      cause: err,
    });
  }

  const result = automationConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new AutomationError({
      code: ErrorCode.CONFIG_INVALID,
      message: `Config validation failed:\n${issues}`,
    });
  }

  return { ...result.data, configPath };
}

export function redactedConfig(config: ResolvedConfig): Record<string, unknown> {
  return {
    ...config,
    templateGuideUrl: config.templateGuideUrl ? '<redacted>' : '',
  };
}
