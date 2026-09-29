import type { MetaEventOptions } from '../types/meta-event';

/** Metadata key for `@MetaEvent`. */
export const META_EVENT_METADATA = Symbol('META_EVENT_METADATA');

/**
 * Declare the Meta event to fire after this handler succeeds (SPEC.md §5.2).
 *
 * Metadata only — this performs no I/O and constructs no SDK objects
 * (invariant 2). The interceptor does all the work.
 */
export function MetaEvent<T = unknown>(options: MetaEventOptions<T>): MethodDecorator {
  return (_target, _propertyKey, descriptor) => {
    const handler = (descriptor as TypedPropertyDescriptor<unknown>).value;
    if (typeof handler !== 'function') {
      throw new Error('@MetaEvent can only be applied to a method.');
    }
    Reflect.defineMetadata(META_EVENT_METADATA, options, handler);
  };
}
