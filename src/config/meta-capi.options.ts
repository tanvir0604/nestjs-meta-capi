import type {
  InjectionToken,
  ModuleMetadata,
  OptionalFactoryDependency,
  Provider,
} from '@nestjs/common';

/** How the event is delivered relative to the request (SPEC.md §10.1). */
export type DeliveryMode = 'async' | 'sync';

/** Levels understood by the built-in logger. */
export type LogLevel = 'debug' | 'log' | 'warn' | 'error';

/** One dataset (pixel + token). Never assume there is only one (ADR-1). */
export interface DatasetConfig {
  datasetId: string;
  accessToken: string;
  /** Explicit opt-in only (ADR-9). Never defaulted. */
  testEventCode?: string;
}

export interface DeliveryOptions {
  mode: DeliveryMode;
}

export interface RetryOptions {
  enabled?: boolean;
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
}

export interface LoggingOptions {
  enabled?: boolean;
  level?: LogLevel;
}

/**
 * First-party cookie write-back (ADR-8). Opt-in, default off.
 *
 * When enabled, the Parameter Builder's `cookiesToSet` (`_fbc` / `_fbp`) are
 * written to the response so attribution survives across visits.
 */
export interface CookieOptions {
  enabled?: boolean;
}

/** The public module options (SPEC.md §5.1). */
export interface MetaCapiModuleOptions {
  datasets: Record<string, DatasetConfig>;
  defaultDataset?: string;
  delivery?: DeliveryOptions;
  retry?: RetryOptions;
  logging?: LoggingOptions;
  cookies?: CookieOptions;
}

/** A dataset with its name and defaults applied. */
export interface ResolvedDataset {
  name: string;
  datasetId: string;
  accessToken: string;
  testEventCode?: string;
}

export interface ResolvedRetryOptions {
  enabled: boolean;
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
}

export interface ResolvedLoggingOptions {
  enabled: boolean;
  level: LogLevel;
}

export interface ResolvedCookieOptions {
  enabled: boolean;
}

/** Options after validation and defaulting. Always safe to consume. */
export interface ResolvedMetaCapiOptions {
  datasets: Record<string, ResolvedDataset>;
  defaultDataset: string;
  delivery: DeliveryOptions;
  retry: ResolvedRetryOptions;
  logging: ResolvedLoggingOptions;
  cookies: ResolvedCookieOptions;
}

/** Options for `forRootAsync` (recommended in production, SPEC.md §5.1). */
export interface MetaCapiModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  inject?: Array<InjectionToken | OptionalFactoryDependency>;
  // Mirrors Nest's own `FactoryProvider` signature — the injected arguments are
  // of arbitrary, caller-declared type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useFactory: (...args: any[]) => MetaCapiModuleOptions | Promise<MetaCapiModuleOptions>;
  providers?: Provider[];
}
