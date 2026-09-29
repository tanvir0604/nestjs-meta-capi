/**
 * Convert a camelCase (or PascalCase) key to the snake_case field name Meta
 * expects. Acronym runs are handled: `fbLoginId` → `fb_login_id`.
 */
export function toSnakeCase(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Recursively snake_case the keys of a value (arrays and nested objects). */
export function snakeCaseKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(snakeCaseKeysDeep);
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) {
        continue;
      }
      out[toSnakeCase(key)] = snakeCaseKeysDeep(entry);
    }
    return out;
  }
  return value;
}
