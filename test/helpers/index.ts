import type {
  MetaCapiModuleOptions,
  ResolvedMetaCapiOptions,
} from '../../src/config/meta-capi.options';
import { resolveOptions } from '../../src/config/validate-options';
import type { MetaCapiLogger, MetaCapiLogMeta } from '../../src/logging/meta-capi.logger';

export const baseOptions: MetaCapiModuleOptions = {
  datasets: { main: { datasetId: 'pixel-main', accessToken: 'token-main' } },
};

export function resolve(overrides: Partial<MetaCapiModuleOptions> = {}): ResolvedMetaCapiOptions {
  return resolveOptions({ ...baseOptions, ...overrides });
}

export interface RecordedLog {
  level: 'debug' | 'log' | 'warn' | 'error';
  message: string;
  meta?: MetaCapiLogMeta;
}

export class RecordingLogger implements MetaCapiLogger {
  readonly records: RecordedLog[] = [];

  debug(message: string, meta?: MetaCapiLogMeta): void {
    this.push('debug', message, meta);
  }

  log(message: string, meta?: MetaCapiLogMeta): void {
    this.push('log', message, meta);
  }

  warn(message: string, meta?: MetaCapiLogMeta): void {
    this.push('warn', message, meta);
  }

  error(message: string, meta?: MetaCapiLogMeta): void {
    this.push('error', message, meta);
  }

  private push(level: RecordedLog['level'], message: string, meta?: MetaCapiLogMeta): void {
    const record: RecordedLog = { level, message };
    if (meta !== undefined) {
      record.meta = meta;
    }
    this.records.push(record);
  }
}
