import type { AutomationConfig } from './config-schema.js';

export interface ResolvedConfig extends AutomationConfig {
  configPath: string;
}
