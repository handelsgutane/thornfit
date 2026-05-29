/**
 * Contact & store info — single source of truth for `/kontakt-oss` og
 * alle andre flater som refererer til butikken (Paper 9WU-1).
 *
 * Hold denne på ett sted slik at åpningstider, adresse og e-post ikke
 * drifter mellom header-utility-bar, kontakt-siden, vilkår-seksjonen og
 * ordre-bekreftelses-mailer. Når Alexander vil endre åpningstidene i
 * julen — én fil, én commit.
 *
 * NB: Paper bruker `rasktsvar@skarpekniver.com` som support-innboks for
 * kontakt-kortene. Den juridiske siden bruker `hei@skarpekniver.com` som
 * personvern-/GDPR-innboks — begge er legitime, de peker forskjellige
 * steder internt.
 */

export interface OpeningHoursRow {
  /** "Mandag — fredag" / "Lørdag" / "Søndag". Brukes som label. */
  readonly label: string;
  /** Åpent-tid eller "Stengt" hvis lukket hele dagen. */
  readonly hours: string;
  /** Sant hvis `hours === 'Stengt'` — styrer muted-fargen i tabellen. */
  readonly closed: boolean;
}

export interface ContactChannel {
  readonly id: 'chat' | 'email' | 'visit';
  readonly title: string;
  readonly description: string;
  /** Tekst på CTA-lenken nederst i kortet. */
  readonly ctaLabel: string;
  /** Hvor lenken peker. `#` betyr ingen egen side — wire opp senere. */
  readonly href: string;
  /**
   * Hvilken fargepalett icon-wrapperen skal ha:
   *  - 'aka': bg-aka (rød) — reservert for chat (aktiv/inviterende kanal)
   *  - 'ink': bg-ink (sort) — for e-post og fysisk besøk (nøytrale kanaler)
   */
  readonly iconTone: 'aka' | 'ink';
}

export const CONTACT_STORE = {
  /** Butikk-/selskapsnavn som vises som H2 i map-overlay. */
  brand: 'THORN FIT',
  /** Kort-adresse som vises i kort/overlay. */
  addressLine: 'Brynsveien 3, 0667 Oslo',
  /** Kort beskrivelse brukt i hero-subtittel og i butikk-seksjonen. */
  description:
    'Vi er en nettbutikk med lager og utleveringssted på Bryn i Oslo. Du kan hente varene etter avtale, eller ta kontakt på e-post eller telefon.',
  /** Geo-koordinater (Bryn, Oslo) — OMTRENTLIGE, verifiser før et ekte map-widget tas i bruk. */
  geo: {
    lat: 59.9085,
    lng: 10.806,
  },
  /** Eksternt kart-link (Google Maps). Åpnes i ny fane fra "Vis i kart"-CTA. */
  mapUrl: 'https://www.google.com/maps/search/?api=1&query=Brynsveien+3+0667+Oslo',
  /** Support-e-post — synlig på kontakt-siden som e-post-CTA. */
  email: 'post@thornfit.no',
} as const;

export const CONTACT_OPENING_HOURS: readonly OpeningHoursRow[] = [
  { label: 'Nettbutikk', hours: 'Åpen hele døgnet', closed: false },
  { label: 'Utlevering på Bryn', hours: 'Etter avtale', closed: false },
] as const;

/**
 * Services vi tilbyr fysisk i butikken — rendres som chips under åpnings-
 * tider i store-section. Ikke lenker — rent informerende.
 */
export const CONTACT_STORE_SERVICES: readonly string[] = [
  'Fri frakt over 1 500 kr',
  'Utlevering på Bryn etter avtale',
  'Personlig rådgivning',
  '14 dagers angrerett',
] as const;

export const CONTACT_CHANNELS: readonly ContactChannel[] = [
  {
    id: 'chat',
    title: 'Chat med oss',
    description:
      'Rask og supervennlig hjelp rett i nettleseren. Tilgjengelig i åpningstider.',
    ctaLabel: 'Start chat',
    // Chat-widget er ikke wired opp enda — CTA scroller tilbake til toppen
    // for nå (hash href gir heller ikke router.push), men Intercom/Crisp
    // tar over denne handleren når widget er på plass.
    href: '#start-chat',
    iconTone: 'aka',
  },
  {
    id: 'email',
    title: 'Send e-post',
    description: 'Vi svarer innen én virkedag. Skriv gjerne hva saken gjelder.',
    ctaLabel: CONTACT_STORE.email,
    href: `mailto:${CONTACT_STORE.email}`,
    iconTone: 'ink',
  },
  {
    id: 'visit',
    title: 'Besøk oss',
    description:
      'Lager og utlevering på Bryn i Oslo. Avtal et tidspunkt, så har vi varene klare.',
    ctaLabel: CONTACT_STORE.addressLine,
    href: CONTACT_STORE.mapUrl,
    iconTone: 'ink',
  },
] as const;

/** Hero-kicker — matcher Paper-copy. */
export const CONTACT_HERO_KICKER = 'Hjelp og kontakt';
export const CONTACT_HERO_TITLE = 'Vi er her for deg';
export const CONTACT_HERO_SUBTITLE =
  'Send oss en e-post, ring, eller hent varene på Bryn i Oslo etter avtale.';
