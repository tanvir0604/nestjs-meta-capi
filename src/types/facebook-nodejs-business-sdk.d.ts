/**
 * Minimal ambient typings for `facebook-nodejs-business-sdk`.
 *
 * The published package ships no TypeScript declarations, so we declare exactly
 * the surface the adapter depends on (ADR-10: the SDK is isolated behind the
 * adapter). Keep this in sync with the SDK version pinned in package.json.
 *
 * Verified against `facebook-nodejs-business-sdk@24.0.1` (Graph `v24.0`) by
 * reading `src/objects/serverside/*`:
 *  - these are the `serverside` objects; the `businessdataapi` objects are a
 *    different, older API and are NOT what we use.
 *  - `ServerEvent` has NO `setReferrerUrl` in this release.
 *  - `ServerEvent.setRequestContext()` and `Preference` exist only on the SDK's
 *    `main` branch (SDK 26.x) and are deliberately absent here.
 */
declare module 'facebook-nodejs-business-sdk' {
  export interface HttpServiceInterface {
    executeRequest(
      url: string,
      method: string,
      headers: Record<string, string>,
      params: Record<string, unknown>,
    ): Promise<EventResponse>;
  }

  export class EventResponse {
    constructor(
      events_received: number,
      messages: string[],
      fbtrace_id: string,
      id: string,
      num_processed_entries: number,
    );
    events_received: number;
    messages: string[];
    fbtrace_id: string;
    id: string;
    num_processed_entries: number;
  }

  export class FacebookAdsApi {
    static readonly GRAPH: string;
    static readonly VERSION: string;
    static readonly SDK_VERSION: string;
    static init(accessToken: string, locale?: string, crashLog?: boolean): FacebookAdsApi;
    static getDefaultApi(): FacebookAdsApi | undefined;
    static setDefaultApi(api: FacebookAdsApi): void;
    accessToken: string;
  }

  export class AdsPixel {
    constructor(id: string, api?: FacebookAdsApi);
    getApi(): FacebookAdsApi;
  }

  export class UserData {
    setEmail(value: string): UserData;
    setPhone(value: string): UserData;
    setFirstName(value: string): UserData;
    setLastName(value: string): UserData;
    setDateOfBirth(value: string): UserData;
    setGender(value: string): UserData;
    setCity(value: string): UserData;
    setState(value: string): UserData;
    setZip(value: string): UserData;
    setCountry(value: string): UserData;
    setExternalId(value: string): UserData;
    setSubscriptionId(value: string): UserData;
    setLeadId(value: string): UserData;
    setFbLoginId(value: string): UserData;
    setClientIpAddress(value: string): UserData;
    setClientUserAgent(value: string): UserData;
    setFbc(value: string): UserData;
    setFbp(value: string): UserData;
    normalize(): Record<string, unknown>;
  }

  export class CustomData {
    setValue(value: number): CustomData;
    setNetRevenue(value: number): CustomData;
    setCurrency(value: string): CustomData;
    setContentName(value: string): CustomData;
    setContentCategory(value: string): CustomData;
    setContentIds(value: string[]): CustomData;
    setContentType(value: string): CustomData;
    setContents(value: unknown[]): CustomData;
    setOrderId(value: string): CustomData;
    setNumItems(value: number): CustomData;
    setPredictedLtv(value: number): CustomData;
    setStatus(value: string): CustomData;
    setSearchString(value: string): CustomData;
    setDeliveryCategory(value: string): CustomData;
    setCustomProperties(value: Record<string, unknown>): CustomData;
    normalize(): Record<string, unknown>;
  }

  export class ServerEvent {
    setEventName(value: string): ServerEvent;
    setEventTime(value: number): ServerEvent;
    setEventId(value: string): ServerEvent;
    setActionSource(value: string): ServerEvent;
    setEventSourceUrl(value: string): ServerEvent;
    setUserData(value: UserData): ServerEvent;
    setCustomData(value: CustomData): ServerEvent;
    normalize(): Record<string, unknown>;
  }

  export class EventRequest {
    constructor(
      accessToken: string,
      pixelId: string,
      events?: ServerEvent[],
      partnerAgent?: string | null,
      testEventCode?: string | null,
      namespaceId?: string | null,
      uploadId?: string | null,
      uploadTag?: string | null,
      uploadSource?: string | null,
      debugModeFlag?: boolean,
      httpService?: HttpServiceInterface | null,
      appSecret?: string,
    );
    setEvents(events: ServerEvent[]): EventRequest;
    setTestEventCode(code: string): EventRequest;
    setHttpService(service: HttpServiceInterface): EventRequest;
    execute(): Promise<EventResponse>;
  }
}
