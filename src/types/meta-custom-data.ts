/**
 * A single entry of a `contents` array (Meta `custom_data.contents`).
 */
export interface MetaCustomDataContent {
  id?: string;
  quantity?: number;
  itemPrice?: number;
  title?: string;
  description?: string;
  brand?: string;
  category?: string;
  deliveryCategory?: string;
  [key: string]: unknown;
}

/**
 * Custom-data parameters for a Meta event (SPEC.md §5.5).
 *
 * Keys are camelCase here and converted to the snake_case fields Meta expects
 * by the custom-data builder. Unknown keys are passed through via
 * `custom_data.custom_properties`.
 */
export interface MetaCustomData {
  value?: number;
  netRevenue?: number;
  currency?: string;
  contentName?: string;
  contentCategory?: string;
  contentIds?: string[];
  contentType?: string;
  contents?: MetaCustomDataContent[];
  orderId?: string;
  numItems?: number;
  predictedLtv?: number;
  status?: string;
  searchString?: string;
  deliveryCategory?: string;
  [key: string]: unknown;
}
