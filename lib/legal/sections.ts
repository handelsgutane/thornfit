/**
 * sections.ts — single source of truth for Vilkår og personvern.
 *
 * TOC-en (desktop) og tab-raden (mobil) leser fra samme liste, så sortering
 * og aktive-tilstand garantert matcher. `id` er URL-anchor og tab-key,
 * `number` er den viste tosifrede seksjons-etiketten ("01"–"06"), `title`
 * er desktop-overskrift + TOC-label, `mobileLabel` er det kortere navnet
 * Paper bruker i tab-raden (`Personvern` i stedet for `Personvernerklæring`).
 *
 * Hvis en seksjon legges til, oppdater både denne lista og enum-typen
 * `LegalSectionId` så TypeScript tvinger rendrings-lista til å dekke alt.
 */
export type LegalSectionId =
  | 'kjopsbetingelser'
  | 'personvern'
  | 'retur'
  | 'frakt'
  | 'cookies'
  | 'kontakt';

export interface LegalSection {
  id: LegalSectionId;
  number: string;
  title: string;
  mobileLabel: string;
}

export const LEGAL_SECTIONS: readonly LegalSection[] = [
  {
    id: 'kjopsbetingelser',
    number: '01',
    title: 'Kjøpsbetingelser',
    mobileLabel: 'Kjøpsbetingelser',
  },
  {
    id: 'personvern',
    number: '02',
    title: 'Personvernerklæring',
    mobileLabel: 'Personvern',
  },
  {
    id: 'retur',
    number: '03',
    title: 'Retur og reklamasjon',
    mobileLabel: 'Retur',
  },
  {
    id: 'frakt',
    number: '04',
    title: 'Frakt og levering',
    mobileLabel: 'Frakt',
  },
  {
    id: 'cookies',
    number: '05',
    title: 'Informasjonskapsler',
    mobileLabel: 'Cookies',
  },
  {
    id: 'kontakt',
    number: '06',
    title: 'Kontakt oss',
    mobileLabel: 'Kontakt',
  },
] as const;

/** Dato-strengen Paper viser i hero — endres manuelt når teksten oppdateres. */
export const LEGAL_LAST_UPDATED = '1. april 2026';

/** Kort intro-paragraf i hero (desktop) — brukes ikke på mobil. */
export const LEGAL_HERO_INTRO =
  'Alt du trenger å vite om hvordan vi håndterer dine opplysninger, kjøpsbetingelser og rettighetene dine som kunde.';

/** Kontakt-linje i TOC-foten + i mobil-footer. */
export const LEGAL_CONTACT = {
  email: 'post@thornfit.no',
  phone: '+47 22 00 00 00',
} as const;
