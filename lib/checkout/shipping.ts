/**
 * Shipping-alternativer for checkout.
 *
 * MVP: hardkodet to Posten-valg. Skulle senere synkes fra WooCommerce
 * shipping-zones via egen sync-cron — for å være authoritative kilde slik
 * at frontend og Woo ikke divergerer.
 *
 * NB: Pickup-i-butikk er IKKE en shipping-method — det er en delivery-mode
 * som velges på et høyere nivå (`Levering`-seksjonen i checkout). Når
 * delivery-mode er "send", velger brukeren én av disse SHIPPING_METHODS.
 * Når delivery-mode er "pickup", er hele shipping-seksjonen skjult og
 * shipping-cost = 0.
 *
 * Når den synken kommer, byttes denne fila til å lese fra Supabase-tabellen.
 * Komponentene som leser `getShippingMethod()` skal ikke trenge endring.
 */

export interface ShippingMethod {
  /** Stabil ID brukt i URL/form. */
  id: 'posten-sporing' | 'posten-hjem';
  /** Synlig navn i radio-listen. */
  title: string;
  /** Underline-tekst. Forklarer hva metoden faktisk er. */
  description: string;
  /** Pris i NOK (kr inkl. mva). 0 = gratis. */
  cost: number;
  /** Default-valgt? Brukes til å pre-selecte i form. */
  default?: boolean;
}

/**
 * Default shipping-options. Begge er statiske inntil Woo-sync kommer.
 */
export const SHIPPING_METHODS: ShippingMethod[] = [
  {
    id: 'posten-sporing',
    title: 'Posten Norge inkl. sporing',
    description: 'Leveres til nærmeste postkontor — 1–3 virkedager',
    cost: 75,
    default: true,
  },
  {
    id: 'posten-hjem',
    title: 'Posten Norge Hjemlevering',
    description: 'Leveres direkte til døren — 1–3 virkedager',
    cost: 160,
  },
];

/** Delivery-mode (over shipping-method). */
export type DeliveryMode = 'send' | 'pickup';

export function getShippingMethod(id: string): ShippingMethod | undefined {
  return SHIPPING_METHODS.find((m) => m.id === id);
}

export function getDefaultShippingMethod(): ShippingMethod {
  return SHIPPING_METHODS.find((m) => m.default) ?? SHIPPING_METHODS[0];
}
