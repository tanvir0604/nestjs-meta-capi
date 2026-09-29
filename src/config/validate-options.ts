import { Logger } from '@nestjs/common';

import { MetaCapiConfigurationError } from '../errors/meta-capi.error';
import type {
  DatasetConfig,
  DeliveryMode,
  LogLevel,
  MetaCapiModuleOptions,
  ResolvedDataset,
  ResolvedMetaCapiOptions,
} from './meta-capi.options';

const DATASET_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const DELIVERY_MODES: readonly DeliveryMode[] = ['async', 'sync'];
const LOG_LEVELS: readonly LogLevel[] = ['debug', 'log', 'warn', 'error'];

const DEFAULTS = {
  deliveryMode: 'async' as DeliveryMode,
  retry: { enabled: true, maxAttempts: 3, initialDelayMs: 500, maxDelayMs: 10_000 },
  logging: { enabled: true, level: 'error' as LogLevel },
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Validate and normalize module options, failing fast with an actionable
 * message (SPEC.md §7). Never includes a token — not even partially.
 */
export function resolveOptions(options: MetaCapiModuleOptions): ResolvedMetaCapiOptions {
  if (!isPlainObject(options)) {
    throw new MetaCapiConfigurationError(
      'MetaCapi configuration error: options must be an object.',
    );
  }

  const { datasets } = options;

  if (!isPlainObject(datasets) || Object.keys(datasets).length === 0) {
    throw new MetaCapiConfigurationError(
      'MetaCapi configuration error: at least one dataset must be configured.',
    );
  }

  const resolvedDatasets: Record<string, ResolvedDataset> = {};

  for (const [name, config] of Object.entries(datasets)) {
    if (!DATASET_NAME_PATTERN.test(name)) {
      throw new MetaCapiConfigurationError(
        `MetaCapi configuration error: dataset name "${name}" is invalid; use letters, digits, ".", "_" or "-".`,
      );
    }

    if (!isPlainObject(config)) {
      throw new MetaCapiConfigurationError(
        `MetaCapi configuration error: dataset "${name}" must be an object.`,
      );
    }

    const dataset = config as DatasetConfig;

    if (!isNonEmptyString(dataset.datasetId)) {
      throw new MetaCapiConfigurationError(
        `MetaCapi configuration error: dataset "${name}" is missing "datasetId".`,
      );
    }

    if (!isNonEmptyString(dataset.accessToken)) {
      throw new MetaCapiConfigurationError(
        `MetaCapi configuration error: dataset "${name}" is missing "accessToken".`,
      );
    }

    if (dataset.testEventCode !== undefined && !isNonEmptyString(dataset.testEventCode)) {
      throw new MetaCapiConfigurationError(
        `MetaCapi configuration error: dataset "${name}" has an empty "testEventCode".`,
      );
    }

    const resolved: ResolvedDataset = {
      name,
      datasetId: dataset.datasetId,
      accessToken: dataset.accessToken,
    };
    if (dataset.testEventCode !== undefined) {
      resolved.testEventCode = dataset.testEventCode;
    }
    resolvedDatasets[name] = resolved;
  }

  const names = Object.keys(resolvedDatasets);
  const defaultDataset = options.defaultDataset ?? names[0];

  if (
    defaultDataset === undefined ||
    !Object.prototype.hasOwnProperty.call(resolvedDatasets, defaultDataset)
  ) {
    throw new MetaCapiConfigurationError(
      `MetaCapi configuration error: "defaultDataset" ("${String(options.defaultDataset)}") is not one of the configured datasets.`,
    );
  }

  const mode = options.delivery?.mode ?? DEFAULTS.deliveryMode;
  if (!DELIVERY_MODES.includes(mode)) {
    throw new MetaCapiConfigurationError(
      `MetaCapi configuration error: unsupported delivery mode "${String(mode)}"; expected "async" or "sync".`,
    );
  }

  const retry = {
    enabled: options.retry?.enabled ?? DEFAULTS.retry.enabled,
    maxAttempts: options.retry?.maxAttempts ?? DEFAULTS.retry.maxAttempts,
    initialDelayMs: options.retry?.initialDelayMs ?? DEFAULTS.retry.initialDelayMs,
    maxDelayMs: options.retry?.maxDelayMs ?? DEFAULTS.retry.maxDelayMs,
  };

  if (!Number.isInteger(retry.maxAttempts) || retry.maxAttempts < 1) {
    throw new MetaCapiConfigurationError(
      `MetaCapi configuration error: "retry.maxAttempts" must be an integer >= 1 (got ${String(retry.maxAttempts)}).`,
    );
  }
  if (!Number.isFinite(retry.initialDelayMs) || retry.initialDelayMs < 0) {
    throw new MetaCapiConfigurationError(
      `MetaCapi configuration error: "retry.initialDelayMs" must be >= 0 (got ${String(retry.initialDelayMs)}).`,
    );
  }
  if (!Number.isFinite(retry.maxDelayMs) || retry.maxDelayMs < 0) {
    throw new MetaCapiConfigurationError(
      `MetaCapi configuration error: "retry.maxDelayMs" must be >= 0 (got ${String(retry.maxDelayMs)}).`,
    );
  }
  if (retry.initialDelayMs > retry.maxDelayMs) {
    throw new MetaCapiConfigurationError(
      'MetaCapi configuration error: "retry.initialDelayMs" must not exceed "retry.maxDelayMs".',
    );
  }

  const level = options.logging?.level ?? DEFAULTS.logging.level;
  if (!LOG_LEVELS.includes(level)) {
    throw new MetaCapiConfigurationError(
      `MetaCapi configuration error: unsupported logging level "${String(level)}".`,
    );
  }

  if (options.cookies?.enabled !== undefined && typeof options.cookies.enabled !== 'boolean') {
    throw new MetaCapiConfigurationError(
      `MetaCapi configuration error: "cookies.enabled" must be a boolean (got ${typeof options.cookies.enabled}).`,
    );
  }

  const resolved: ResolvedMetaCapiOptions = {
    datasets: resolvedDatasets,
    defaultDataset,
    delivery: { mode },
    retry,
    logging: { enabled: options.logging?.enabled ?? DEFAULTS.logging.enabled, level },
    cookies: { enabled: options.cookies?.enabled ?? false },
  };

  warnOnProductionTestEventCode(resolved);

  return resolved;
}

/**
 * Warn — do not throw — when a test event code is configured in production
 * (ADR-9). Almost always a mistake.
 *
 * `NODE_ENV` is read here only to decide whether to warn; config *values* are
 * always supplied by the app (SPEC.md §5.1).
 */
function warnOnProductionTestEventCode(options: ResolvedMetaCapiOptions): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const logger = new Logger('MetaCapi');
  for (const dataset of Object.values(options.datasets)) {
    if (dataset.testEventCode !== undefined) {
      logger.warn(
        `dataset "${dataset.name}" sets "testEventCode" while NODE_ENV=production. ` +
          'Test events will not be attributed to production data.',
      );
    }
  }
}
