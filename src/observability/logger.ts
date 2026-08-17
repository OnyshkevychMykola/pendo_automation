import pino from 'pino';
import type { Logger as PinoLogger } from 'pino';

export type Logger = PinoLogger;

export interface LoggerOptions {
  debug?: boolean;
  logFile?: string;
  releaseId?: string;
  command?: string;
}

export function createLogger(opts: LoggerOptions = {}): Logger {
  const level = opts.debug ? 'debug' : 'info';
  const baseContext = {
    ...(opts.releaseId ? { releaseId: opts.releaseId } : {}),
    ...(opts.command ? { command: opts.command } : {}),
  };

  const targets: pino.TransportTargetOptions[] = [
    {
      target: 'pino-pretty',
      level,
      options: { colorize: true, ignore: 'pid,hostname' },
    },
  ];

  if (opts.logFile) {
    targets.push({
      target: 'pino/file',
      level,
      options: { destination: opts.logFile },
    });
  }

  const transport = pino.transport({ targets });
  const logger = pino({ level, base: baseContext }, transport);
  return logger;
}
