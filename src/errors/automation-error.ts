import { type ErrorCode } from './error-codes.js';

export type RunPhase =
  | 'preflight'
  | 'cloned'
  | 'steps-shaped'
  | 'text-populated'
  | 'media-populated'
  | 'saved'
  | 'verified';

export interface AutomationErrorOptions {
  code: ErrorCode;
  message: string;
  phase?: RunPhase;
  releaseId?: string;
  guideUrl?: string;
  resumable?: boolean;
  details?: Record<string, unknown>;
  artifactDirectory?: string;
  cause?: unknown;
}

export class AutomationError extends Error {
  readonly code: ErrorCode;
  readonly phase: RunPhase | undefined;
  readonly releaseId: string | undefined;
  readonly guideUrl: string | undefined;
  readonly resumable: boolean;
  readonly details: Record<string, unknown>;
  readonly artifactDirectory: string | undefined;

  constructor(opts: AutomationErrorOptions) {
    super(opts.message);
    this.name = 'AutomationError';
    this.code = opts.code;
    this.phase = opts.phase;
    this.releaseId = opts.releaseId;
    this.guideUrl = opts.guideUrl;
    this.resumable = opts.resumable ?? false;
    this.details = opts.details ?? {};
    this.artifactDirectory = opts.artifactDirectory;

    if (opts.cause instanceof Error) {
      this.cause = opts.cause;
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      phase: this.phase,
      releaseId: this.releaseId,
      guideUrl: this.guideUrl,
      resumable: this.resumable,
      details: this.details,
      artifactDirectory: this.artifactDirectory,
    };
  }
}

export function isAutomationError(err: unknown): err is AutomationError {
  return err instanceof AutomationError;
}
