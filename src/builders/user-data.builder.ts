import type { MetaNormalizedUserData } from '../clients/meta-sdk.adapter';
import type { MetaUserData } from '../types/meta-user-data';
import { toSnakeCase } from './to-snake-case';

/**
 * Map user data to the snake_case fields the SDK expects (ADR-3).
 *
 * Values pass through **raw**. We never hash here: the SDK's Parameter Builder
 * normalizes and SHA-256 hashes them, and pre-hashing would double-hash.
 */
export function buildUserData(user?: MetaUserData): MetaNormalizedUserData {
  const out: MetaNormalizedUserData = {};
  if (user === undefined) {
    return out;
  }

  for (const [key, value] of Object.entries(user)) {
    if (typeof value === 'string' && value.length > 0) {
      out[toSnakeCase(key)] = value;
    }
  }

  return out;
}
