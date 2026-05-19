/**
 * Betalingsalternativer for checkout.
 *
 * MVP: to valg. Faktura (EHF/E-post) for B2B-kjøp, og kort/Vipps/Klarna
 * via vår eksisterende Stripe/Vipps-flow. Når Vipps/Stripe-integrasjonen
 * faktisk kobles på Bekreft-knappen, byttes "Betal med kort"-action.
 */

export type PaymentMethodId = 'invoice' | 'card';

export interface PaymentMethod {
  id: PaymentMethodId;
  title: string;
  description: string;
  default?: boolean;
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: 'invoice',
    title: 'Faktura (EHF / E-post)',
    description: 'Betal via faktura. Vi sender EHF til bedriften eller e-post til deg.',
    default: true,
  },
  {
    id: 'card',
    title: 'Betal med kort nå',
    description: 'Visa, Mastercard, Vipps, Klarna, Apple Pay, Google Pay',
  },
];

export function getDefaultPaymentMethod(): PaymentMethod {
  return PAYMENT_METHODS.find((m) => m.default) ?? PAYMENT_METHODS[0];
}
