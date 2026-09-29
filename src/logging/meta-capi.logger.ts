import { Logger } from '@nestjs/common';

import type { LogLevel, ResolvedLoggingOptions } from '../config/meta-capi.options';

/** Safe, structured metadata attached to a log line. */
export type MetaCapiLogMeta = Record<string, unknown>;

/** The logger abstraction the package depends on (SPEC.md §9). */
export interface MetaCapiLogger {
  debug(message: string, meta?: MetaCapiLogMeta): void;
  log(message: string, meta?: MetaCapiLogMeta): void;
  warn(message: string, meta?: MetaCapiLogMeta): void;
  error(message: string, meta?: MetaCapiLogMeta): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, log: 1, warn: 2, error: 3 };

/**
 * Keys whose values must never reach a log sink: secrets and raw PII. Redaction
 * happens here, at the logger boundary, so it cannot be forgotten at a call
 * site (SPEC.md §9).
 */
const SENSITIVE_KEY_PATTERN = /(token|secret|authorization|cookie|password|e-?mail|phone)/i;

/** Recursively replace sensitive values with a placeholder. */
export function redactMeta(meta: MetaCapiLogMeta): MetaCapiLogMeta {
  const redacted: MetaCapiLogMeta = {};
  for (const [key, value] of Object.entries(meta)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      redacted[key] = '[REDACTED]';
    } else if (Array.isArray(value)) {
      redacted[key] = value.map((entry) =>
        typeof entry === 'object' && entry !== null ? redactMeta(entry as MetaCapiLogMeta) : entry,
      );
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactMeta(value as MetaCapiLogMeta);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

function stringify(meta: MetaCapiLogMeta): string {
  try {
    return JSON.stringify(meta);
  } catch {
    return '';
  }
}

/** Default logger: a NestJS `Logger` with mandatory redaction and level gating. */
export class StructuredLogger implements MetaCapiLogger {
  private readonly logger: Logger;

  constructor(
    private readonly options: ResolvedLoggingOptions,
    context = 'MetaCapi',
  ) {
    this.logger = new Logger(context);
  }

  debug(message: string, meta?: MetaCapiLogMeta): void {
    this.emit('debug', message, meta);
  }

  log(message: string, meta?: MetaCapiLogMeta): void {
    this.emit('log', message, meta);
  }

  warn(message: string, meta?: MetaCapiLogMeta): void {
    this.emit('warn', message, meta);
  }

  error(message: string, meta?: MetaCapiLogMeta): void {
    this.emit('error', message, meta);
  }

  private emit(level: LogLevel, message: string, meta?: MetaCapiLogMeta): void {
    if (!this.options.enabled || LEVEL_ORDER[level] < LEVEL_ORDER[this.options.level]) {
      return;
    }

    const text =
      meta === undefined || Object.keys(meta).length === 0
        ? message
        : `${message} ${stringify(redactMeta(meta))}`;

    this.logger[level](text);
  }
}
