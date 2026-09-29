import type { MetaRequestContext } from '../clients/request-context';
import type { MetaEventPayload } from '../types/meta-event';

/**
 * The delivery seam (ADR-6). A `BullMqTransport` can be dropped in later
 * without making BullMQ a dependency of core.
 */
export interface MetaEventTransport {
  /**
   * @param payload The event to deliver.
   * @param context Request context already extracted by the HTTP layer, if any.
   *   When omitted, the transport extracts it from `payload.request`.
   */
  send(payload: MetaEventPayload, context?: MetaRequestContext): Promise<void>;
}
