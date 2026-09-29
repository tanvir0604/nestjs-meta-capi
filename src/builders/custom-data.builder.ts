import type { MetaNormalizedCustomData } from '../clients/meta-sdk.adapter';
import type { MetaCustomData } from '../types/meta-custom-data';
import { snakeCaseKeysDeep, toSnakeCase } from './to-snake-case';

/**
 * Map custom data to the snake_case fields the SDK expects: `contentName` →
 * `content_name`, `numItems` → `num_items`, and so on. Nested `contents`
 * entries are converted too. Unknown keys survive and are delivered through
 * `custom_data.custom_properties` by the adapter.
 */
export function buildCustomData(custom?: MetaCustomData): MetaNormalizedCustomData {
  const out: MetaNormalizedCustomData = {};
  if (custom === undefined) {
    return out;
  }

  for (const [key, value] of Object.entries(custom)) {
    if (value === undefined || value === null) {
      continue;
    }
    out[toSnakeCase(key)] = snakeCaseKeysDeep(value);
  }

  return out;
}
