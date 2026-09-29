/**
 * User-data parameters for a Meta event (SPEC.md §5.5, ADR-3).
 *
 * Values are **raw** — never pre-hash. The SDK normalizes and SHA-256 hashes
 * these for us. Pre-hashing silently destroys match quality.
 */
export interface MetaUserData {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gender?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  externalId?: string;
  subscriptionId?: string;
  leadId?: string;
  fbLoginId?: string;
  /**
   * Derived from the request when omitted — see request-context extraction.
   */
  clientIpAddress?: string;
  /**
   * Derived from the `user-agent` header when omitted. Never auto-filled by the
   * Parameter Builder, so we set it ourselves (§6).
   */
  clientUserAgent?: string;
  /** Facebook click id — derived from the request when omitted. */
  fbc?: string;
  /** Facebook browser id — derived from the request when omitted. */
  fbp?: string;
}
