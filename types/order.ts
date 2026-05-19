/**
 * Order types — these live in Woo, not Supabase.
 *
 * Types here describe the shape we pass around our own code; field names are
 * normalized to camelCase. The Woo REST payload is mapped via a helper (see
 * `lib/woo/orders.ts` when it exists) before being exposed to components.
 */

import type { Address } from './user';

export type OrderStatus =
  | 'pending'
  | 'processing'
  | 'on-hold'
  | 'completed'
  | 'cancelled'
  | 'refunded'
  | 'failed';

export type PaymentMethod = 'vipps' | 'stripe';

export interface OrderLineItem {
  productId: number;
  variationId: number | null;
  name: string;
  sku: string | null;
  quantity: number;
  /** Unit price (incl. VAT). */
  price: number;
  /** Line total (incl. VAT, after discounts). */
  total: number;
  imageUrl: string | null;
}

export interface OrderTotals {
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  /** Share of `total` that is VAT. */
  vatAmount: number;
}

export interface Order {
  id: number;
  number: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;

  customerId: number | null;
  billingEmail: string;
  billing: Address;
  shipping: Address;

  lineItems: OrderLineItem[];
  totals: OrderTotals;

  paymentMethod: PaymentMethod | null;
  paymentReference: string | null;

  /** Norwegian VAT rate used on this order (usually 0.25). */
  taxRate: number;

  couponCodes: string[];
  shippingMethod: string | null;
  trackingNumber: string | null;

  /** Full Woo payload for debugging. */
  sourcePayload?: unknown;
}
