import { AutomationError } from './automation-error.js';
import { ErrorCode, exitCodeFor } from './error-codes.js';

export interface SerializedError {
  code: string;
  message: string;
  exitCode: number;
  phase?: string;
  releaseId?: string;
  guideUrl?: string;
  resumable: boolean;
  details?: Record<string, unknown>;
  cause?: string;
}

export function serializeError(err: unknown): SerializedError {
  if (err instanceof AutomationError) {
    return {
      code: err.code,
      message: err.message,
      exitCode: exitCodeFor(err.code),
      phase: err.phase,
      releaseId: err.releaseId,
      guideUrl: err.guideUrl,
      resumable: err.resumable,
      details: Object.keys(err.details).length > 0 ? err.details : undefined,
      cause: err.cause instanceof Error ? err.cause.message : undefined,
    };
  }

  if (err instanceof Error) {
    return {
      code: ErrorCode.INTERNAL_ERROR,
      message: err.message,
      exitCode: 9,
      resumable: false,
      cause: err.stack,
    };
  }

  return {
    code: ErrorCode.INTERNAL_ERROR,
    message: String(err),
    exitCode: 9,
    resumable: false,
  };
}

export function exitCodeFromError(err: unknown): number {
  return serializeError(err).exitCode;
}
