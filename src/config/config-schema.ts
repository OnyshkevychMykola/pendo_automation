import { z } from 'zod';

const browserSchema = z
  .object({
    channel: z.enum(['chrome', 'chromium', 'msedge']).default('chrome'),
    headed: z.literal(true),
    viewport: z
      .object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      })
      .default({ width: 1440, height: 900 }),
    slowMoMs: z.number().int().min(0).default(0),
    defaultTimeoutMs: z.number().int().positive().default(15000),
    navigationTimeoutMs: z.number().int().positive().default(45000),
  })
  .strict();

const pathsSchema = z
  .object({
    artifactsRoot: z.string().min(1).default('./artifacts'),
    stateRoot: z.string().min(1).default('./state'),
  })
  .strict();

export const automationConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    region: z.literal('us'),
    baseUrl: z.string().url(),
    /** Pendo app name as shown in the guide details subtitle, e.g. "Hub" */
    targetAppName: z.string().trim().min(1),
    templateGuideName: z.string().trim().min(1),
    templateGuideUrl: z.string().url().or(z.literal('')).optional(),
    templateVersion: z.number().int().positive(),
    /** Target page name shown in Pendo, e.g. "Conversational Analytics" */
    expectedPageName: z.string().trim().min(1),
    browser: browserSchema,
    paths: pathsSchema,
  })
  .strict();

export type AutomationConfigInput = z.input<typeof automationConfigSchema>;
export type AutomationConfig = z.output<typeof automationConfigSchema>;
