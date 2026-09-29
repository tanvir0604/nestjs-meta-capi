/** Metadata key for `@MetaDataset`. */
export const META_DATASET_METADATA = Symbol('META_DATASET_METADATA');

/**
 * Callable on a class (1 argument) or a method (2 arguments). An explicit type
 * keeps both `@MetaDataset('x')` on a controller and on a handler valid.
 */
export type MetaDatasetDecorator = (
  target: object,
  propertyKey?: string | symbol,
  descriptor?: PropertyDescriptor,
) => void;

/**
 * Bind a controller and/or a single handler to a configured dataset
 * (SPEC.md §5.2). Metadata only — no I/O (invariant 2).
 *
 * Precedence: `@MetaEvent({ dataset })` → method `@MetaDataset` → controller
 * `@MetaDataset` → configured default.
 */
export function MetaDataset(name: string): MetaDatasetDecorator {
  return (target: object, _propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    // On a method, store the metadata on the handler function itself (as Nest's
    // `@SetMetadata` does) so `Reflector.get(key, handler)` can read it. On a
    // class, store it on the constructor.
    const handler = descriptor?.value;
    if (typeof handler === 'function') {
      Reflect.defineMetadata(META_DATASET_METADATA, name, handler);
      return;
    }
    Reflect.defineMetadata(META_DATASET_METADATA, name, target);
  };
}
