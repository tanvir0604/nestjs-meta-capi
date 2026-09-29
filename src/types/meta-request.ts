/**
 * A structural view of an HTTP request that works for both Express and Fastify
 * (and a bare Node `http.IncomingMessage`). We only declare what we read; the
 * request object itself is forwarded to Meta's Parameter Builder untouched.
 */
export interface MetaRequestLike {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  url?: string;
  originalUrl?: string;
  protocol?: string;
  method?: string;
  get?(name: string): string | undefined;
  socket?: { remoteAddress?: string; encrypted?: boolean };
  connection?: { remoteAddress?: string };
}

/**
 * Context handed to `@MetaEvent` mappers as the third argument.
 */
export interface MetaEventContext {
  /** The dataset the event will be delivered to, when resolvable. */
  dataset?: string;
}
