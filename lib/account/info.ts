/**
 * Copy + kontrakter for innlogget Profile-area (`/konto/*`).
 *
 * Paper-referanser:
 *   - 6B7-0 — Mine ordrer (Desktop). 1440×709 layout med 260px sidebar +
 *     1052px content.
 *   - 7SO-0 — Profil-meny (Mobile hub). 390×593 hub med 7 nav-rader +
 *     "Logg ut" rød rad uten chevron.
 *   - 7UR-0 — Mine ordrer (Mobile, full-bleed). Egen subside.
 *
 * Hold all UI-tekst her — komponenter importerer kun konstanter. Lav-friksjon
 * å endre wording uten å pirke i JSX, og lett å oversette senere hvis vi
 * åpner andre markeder (per ADR-0005 er vi nb-NO-only nå).
 */

// ---------------------------------------------------------------------------
// Nav-struktur — felles på desktop sidebar og mobile hub
// ---------------------------------------------------------------------------

export type AccountNavIcon =
  | 'package'
  | 'heart'
  | 'user'
  | 'pin'
  | 'card'
  | 'settings';

export interface AccountNavItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: AccountNavIcon;
}

export const ACCOUNT_NAV: readonly AccountNavItem[] = [
  {
    id: 'orders',
    label: 'Dine ordrer',
    href: '/konto/ordrer',
    icon: 'package',
  },
  {
    id: 'wishlist',
    label: 'Ønskeliste',
    href: '/konto/onskeliste',
    icon: 'heart',
  },
  {
    id: 'profile',
    label: 'Personlig informasjon',
    href: '/konto/personlig-informasjon',
    icon: 'user',
  },
  {
    id: 'addresses',
    label: 'Adresser',
    href: '/konto/adresser',
    icon: 'pin',
  },
  {
    id: 'settings',
    label: 'Innstillinger',
    href: '/konto/innstillinger',
    icon: 'settings',
  },
] as const;

// ---------------------------------------------------------------------------
// Logg ut
// ---------------------------------------------------------------------------

export const LOGOUT_LABEL = 'Logg ut';
export const LOGOUT_PENDING_LABEL = 'Logger ut …';
export const LOGOUT_ERROR = 'Kunne ikke logge ut. Prøv igjen.';

// ---------------------------------------------------------------------------
// Profil-card / mobile hub
// ---------------------------------------------------------------------------

/** Vises som fallback når displayName mangler i `skn_user`-cookien. */
export const PROFILE_FALLBACK_NAME = 'Min konto';

// ---------------------------------------------------------------------------
// Dine ordrer
// ---------------------------------------------------------------------------

export const ORDERS_TITLE = 'Dine ordrer';
export const ORDERS_SUBTITLE_SINGULAR = 'ordre totalt';
export const ORDERS_SUBTITLE_PLURAL = 'ordrer totalt';
/**
 * Mobile-spesifikk subtitle (Paper B6Q-0 B7I-0): kortform "12 totalt" — uten
 * "ordre/ordrer" — siden den står inline med tittelen og spaceen er knapp.
 */
export const ORDERS_SUBTITLE_MOBILE = 'totalt';
export const ORDERS_BACK_LABEL = 'Tilbake til konto';
export const ORDERS_SEARCH_PLACEHOLDER = 'Søk i ordrer...';
export const ORDERS_SEARCH_ARIA_LABEL = 'Søk i mine ordrer';

export const ORDERS_TABLE_HEADERS = {
  number: 'Ordrenr.',
  products: 'Produkter',
  date: 'Dato',
  status: 'Status',
  total: 'Total',
} as const;

export const ORDERS_LOAD_MORE_LABEL = 'Vis flere ordrer';

/**
 * "Se detaljer →"-lenke under totalbeløp i ordre-tabellen (Paper 6B7-0 6F4-0).
 * Tar bruker til ordredetalj-siden (`/konto/ordrer/[id]` — kommer i ordredetalj-
 * milestonen, foreløpig peker den til samme listen).
 */
export const ORDERS_SEE_DETAILS_LABEL = 'Se detaljer →';

/**
 * Render "1 produkt" / "N produkter" / "FirstName + N-1 produkter til" iht.
 * Paper 6B7-0:
 *   - itemCount = 1: kun produktnavn på linje 1, "1 produkt" på linje 2.
 *   - itemCount > 1: produktnavn på linje 1, "+ N-1 produkter til" på linje 2.
 * Når itemCount === 1 skal sub-linjen sannsynligvis _ikke_ vises i Paper —
 * i screenshots er linje 2 alltid "+ N produkter til" eller "1 produkt"/"2
 * produkter" (count-only). Vi følger den siste varianten her.
 */
export function getOrderItemsCountLabel(itemCount: number): string {
  if (itemCount <= 0) return 'Ingen produkter';
  if (itemCount === 1) return '1 produkt';
  return `${itemCount} produkter`;
}

/**
 * "+ N produkter til" — vises som sub-linje når vi har et førsteprodukt-navn
 * og itemCount > 1. Brukes i tabell-Produkter-cellen og mobile rad.
 */
export function getOrderItemsRemainderLabel(itemCount: number): string | null {
  if (itemCount <= 1) return null;
  const remainder = itemCount - 1;
  return `+ ${remainder} ${remainder === 1 ? 'produkt' : 'produkter'} til`;
}

// ---------------------------------------------------------------------------
// Ordredetalj (Paper 6GT-0 desktop / 7UX-0 mobile)
//
// Paper-faithful copy. Title/header-stilen er:
//   - Title-cards (Bestilte varer / Ordreoppsummering / Ordrehistorikk):
//     15px bold, mixed case, divider underneath. Brukes for primær-cards.
//   - Label-cards (Faktureringsadresse / Leveringsadresse /
//     Betalingsinformasjon / Kundens merknad): 13px UPPERCASE bold
//     tracking-[0.04em]. Brukes for sekundær-cards i grids.
// ---------------------------------------------------------------------------

export const ORDER_DETAIL_BACK_LABEL = 'Tilbake til Mine ordrer';
/** Mobile back-knapp er kortere (Paper 888-0). */
export const ORDER_DETAIL_BACK_LABEL_MOBILE = 'Mine ordrer';
export const ORDER_DETAIL_TITLE_PREFIX = 'Ordre';

// Dato-stamps i header (Paper 76Q-0)
export const ORDER_DETAIL_DATE_PLACED_LABEL = 'Bestilt';
export const ORDER_DETAIL_DATE_PAID_LABEL = 'Betalt';
export const ORDER_DETAIL_DATE_COMPLETED_LABEL = 'Fullført';
export const ORDER_DETAIL_DATE_CANCELLED_LABEL = 'Kansellert';

// Card titles
export const ORDER_DETAIL_ITEMS_TITLE = 'Bestilte varer';
export const ORDER_DETAIL_TOTALS_TITLE = 'Ordreoppsummering';
export const ORDER_DETAIL_BILLING_TITLE = 'Faktureringsadresse';
export const ORDER_DETAIL_SHIPPING_TITLE = 'Leveringsadresse';
export const ORDER_DETAIL_PAYMENT_TITLE = 'Betalingsinformasjon';
export const ORDER_DETAIL_NOTE_TITLE = 'Dine merknader';
export const ORDER_DETAIL_NOTE_EMPTY = 'Ingen merknader';
export const ORDER_DETAIL_TIMELINE_TITLE = 'Ordrehistorikk';

// Items-tabell (desktop) — 5 kolonne-headers (Paper 773-0)
export const ORDER_DETAIL_ITEMS_HEADERS = {
  product: 'Produkt',
  quantity: 'Ant.',
  unitPrice: 'Enhetspris',
  vat: 'MVA',
  total: 'Total',
} as const;

// Totals-rader (Paper 781-0)
export const ORDER_DETAIL_TOTALS_LABELS = {
  subtotal: 'Delsum',
  shipping: 'Frakt',
  discount: 'Rabattkode',
  vat: 'MVA',
  total: 'Totalt betalt',
} as const;

export const ORDER_DETAIL_FREE_SHIPPING_LABEL = 'Gratis';

// Payment-card (Paper 797-0)
export const ORDER_DETAIL_PAYMENT_METHOD_LABEL = 'Betalingsmåte';
export const ORDER_DETAIL_PAYMENT_TRANSACTION_LABEL = 'Transaksjons-ID';
export const ORDER_DETAIL_PAYMENT_STATUS_LABEL = 'Betalingsstatus';
export const ORDER_DETAIL_PAYMENT_STATUS_PAID = 'Betalt';
export const ORDER_DETAIL_PAYMENT_STATUS_UNPAID = 'Ikke betalt';
export const ORDER_DETAIL_PAYMENT_STATUS_REFUNDED = 'Refundert';
export const ORDER_DETAIL_PAYMENT_FALLBACK = 'Ikke registrert';

// Empty / fallback
export const ORDER_DETAIL_NO_ITEMS = 'Ingen produkter på denne ordren.';

// Timeline-event-labels (Paper 79R-0). Brukes for syntetisk timeline når
// Woo ikke har order-notes-tilgang. Forsøker å matche Paper-tonen.
export const ORDER_DETAIL_TIMELINE = {
  placed: {
    title: 'Ordre plassert',
    descriptionPrefix: 'Ordre #', // " #10842 opprettet og sendt til behandling."
    descriptionSuffix: ' opprettet og sendt til behandling.',
  },
  paid: {
    title: 'Betaling bekreftet',
    description: 'Betaling registrert mot ordren.',
  },
  processing: {
    title: 'Pakkes hos oss',
    description: 'Ordren er under behandling og pakkes for sending.',
  },
  shipped: {
    title: 'Pakke sendt',
    description: 'Pakken er sendt med Posten.',
  },
  completed: {
    title: 'Ordre levert',
    description: 'Ordren er fullført og levert.',
  },
  cancelled: {
    title: 'Ordre kansellert',
    description: 'Ordren ble kansellert.',
  },
  refunded: {
    title: 'Ordre refundert',
    description: 'Beløpet er refundert til opprinnelig betalingsmåte.',
  },
} as const;
export const ORDER_DETAIL_TIMELINE_ACTOR_SYSTEM = 'System';

export const ORDERS_EMPTY_TITLE = 'Du har ingen ordrer ennå';
export const ORDERS_EMPTY_SUBTITLE =
  'Når du har handlet hos oss vil ordrene dine dukke opp her.';
export const ORDERS_EMPTY_CTA_LABEL = 'Se kniver';
export const ORDERS_EMPTY_CTA_HREF = '/kniver';

// ---------------------------------------------------------------------------
// Status-mapping
// ---------------------------------------------------------------------------

export type OrderStatusVariant = 'success' | 'warning' | 'neutral' | 'danger';

export interface OrderStatusInfo {
  readonly label: string;
  readonly variant: OrderStatusVariant;
}

/**
 * Mapping fra Woo-status-koder til norsk pill-label + farge-variant.
 * Woo-koder: pending, processing, on-hold, completed, cancelled, refunded,
 * failed, shipped (egen — settes av fraktintegrasjonen).
 *
 * Ukjente koder defaulter til neutral via `getOrderStatus()`.
 */
export const ORDER_STATUS_MAP: Readonly<Record<string, OrderStatusInfo>> = {
  pending: { label: 'Avventer', variant: 'neutral' },
  processing: { label: 'Behandles', variant: 'neutral' },
  'on-hold': { label: 'På vent', variant: 'warning' },
  shipped: { label: 'Sendt', variant: 'warning' },
  completed: { label: 'Levert', variant: 'success' },
  cancelled: { label: 'Kansellert', variant: 'danger' },
  refunded: { label: 'Refundert', variant: 'danger' },
  failed: { label: 'Mislyktes', variant: 'danger' },
} as const;

export function getOrderStatus(code: string): OrderStatusInfo {
  return (
    ORDER_STATUS_MAP[code] ?? { label: 'Ukjent', variant: 'neutral' }
  );
}

// ---------------------------------------------------------------------------
// Personlig informasjon (Paper 6GP-0 desktop / 7UT-0 mobile)
//
// NB: Profilbilde-card og fødselsdato-felt er bevisst utelatt foreløpig —
// Profilbilde mangler opplasting-pipeline (Bunny/R2-bestemmes senere) og
// fødselsdato er ikke i Woo-customer-shapen vi har i dag. Begge kan
// re-introduseres når data + endpoints er klare.
// ---------------------------------------------------------------------------

export const PROFILE_TITLE = 'Personlig informasjon';
export const PROFILE_BACK_LABEL = 'Tilbake til konto';

// Personalia-card
export const PROFILE_PERSONALIA_LABEL = 'Personalia';
export const PROFILE_FORM_FIRST_NAME_LABEL = 'Fornavn';
export const PROFILE_FORM_LAST_NAME_LABEL = 'Etternavn';
export const PROFILE_FORM_EMAIL_LABEL = 'E-post';
export const PROFILE_FORM_PHONE_LABEL = 'Telefon';
export const PROFILE_FORM_PHONE_PLACEHOLDER = '+47 000 00 000';
export const PROFILE_FORM_SAVE_LABEL = 'Lagre endringer';
export const PROFILE_FORM_SAVE_PENDING_LABEL = 'Lagrer …';
export const PROFILE_FORM_SAVE_SUCCESS = 'Endringene er lagret.';
export const PROFILE_FORM_SAVE_ERROR =
  'Kunne ikke lagre endringene. Prøv igjen.';

// Passord-card
export const PROFILE_PASSWORD_LABEL = 'Passord';
export const PROFILE_PASSWORD_CURRENT_LABEL = 'Nåværende passord';
export const PROFILE_PASSWORD_NEW_LABEL = 'Nytt passord';
export const PROFILE_PASSWORD_CONFIRM_LABEL = 'Bekreft nytt passord';
export const PROFILE_PASSWORD_PLACEHOLDER = '••••••••••';
export const PROFILE_PASSWORD_SUBMIT_LABEL = 'Endre passord';
export const PROFILE_PASSWORD_SUBMIT_PENDING_LABEL = 'Endrer …';
export const PROFILE_PASSWORD_SUCCESS = 'Passordet er endret.';
export const PROFILE_PASSWORD_MISMATCH =
  'De to nye passordene stemmer ikke overens.';
export const PROFILE_PASSWORD_ERROR =
  'Kunne ikke endre passord. Prøv igjen.';

// ---------------------------------------------------------------------------
// Placeholder-sider — Ønskeliste / Adresser / Betaling / Innstillinger
// ---------------------------------------------------------------------------

export const COMING_SOON_TITLE = 'Kommer snart';
export const COMING_SOON_SUBTITLE =
  'Vi jobber med denne siden — den blir tilgjengelig om kort tid.';
