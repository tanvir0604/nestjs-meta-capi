import type { CookieSettings, ParamBuilder } from 'capi-param-builder-nodejs';

import type { MetaRequestLike } from '../types/meta-request';

/**
 * The request-derived parameters the package fills in for us (SPEC.md §6).
 * `clientUserAgent` is explicitly NOT covered by the Parameter Builder, so we
 * read it from the headers ourselves.
 */
export interface MetaRequestContext {
  fbc?: string;
  fbp?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
  eventSourceUrl?: string;
  cookiesToSet: CookieSettings[];
}

const EMPTY_CONTEXT: MetaRequestContext = { cookiesToSet: [] };

function readUserAgent(request: MetaRequestLike): string | undefined {
  const header = request.headers?.['user-agent'];
  if (typeof header === 'string' && header.length > 0) {
    return header;
  }
  if (Array.isArray(header) && typeof header[0] === 'string') {
    return header[0];
  }
  if (typeof request.get === 'function') {
    const value = request.get('user-agent');
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

/**
 * Extract fbc/fbp/IP/event-source-url from the request using Meta's Parameter
 * Builder, and read `client_user_agent` from the headers.
 *
 * A fresh `ParamBuilder` is used per call because it is stateful. Extraction is
 * best-effort: a malformed request degrades to absent values rather than
 * failing the business request.
 */
export function extractRequestContext(
  request: MetaRequestLike | undefined,
  createParamBuilder: () => ParamBuilder,
): MetaRequestContext {
  if (request === undefined) {
    return { ...EMPTY_CONTEXT };
  }

  const result: MetaRequestContext = { cookiesToSet: [] };

  try {
    const builder = createParamBuilder();
    const cookies = builder.processRequestFromContext(request as object);
    if (Array.isArray(cookies)) {
      result.cookiesToSet = cookies;
    }

    const fbc = builder.getFbc();
    if (fbc) {
      result.fbc = fbc;
    }
    const fbp = builder.getFbp();
    if (fbp) {
      result.fbp = fbp;
    }
    const clientIpAddress = builder.getClientIpAddress();
    if (clientIpAddress) {
      result.clientIpAddress = clientIpAddress;
    }
    const eventSourceUrl = builder.getEventSourceUrl();
    if (eventSourceUrl) {
      result.eventSourceUrl = eventSourceUrl;
    }
  } catch {
    // Best-effort: never fail a business request over request-context parsing.
  }

  const clientUserAgent = readUserAgent(request);
  if (clientUserAgent) {
    result.clientUserAgent = clientUserAgent;
  }

  return result;
}
