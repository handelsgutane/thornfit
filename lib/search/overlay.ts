/**
 * Redaksjonelt overlay for `SearchOverlay` — populære søk + kategori-shortcuts
 * som vises i sidebar før bruker har skrevet noe.
 *
 * I nav-laget ligger tilsvarende data i `site_config.nav_primary`. For søk er
 * volumet lavere (én chip-liste + én kategori-liste) så vi holder det som en
 * TS-konstant inntil redaktørene trenger å endre det uten deploy. Når det
 * tidspunktet kommer: flytt til `site_config.search_overlay` med
 * Zod-validation — samme mønster som `lib/nav/fetch.ts`.
 *
 * Dette er også seed-kilden for DEFAULT-en hvis/når vi migrerer til DB.
 */

export interface PopularQuery {
  /** Visningstekst (chip label). */
  label: string;
  /** Hva som puttes i søkefeltet når chip-en klikkes. */
  query: string;
}

export interface CategoryShortcut {
  /** Visningstekst. */
  label: string;
  /** Full href — matcher nested kategori-path. */
  href: string;
  /** Valgfri produkt-teller som vises etter label. Vedlikeholdes manuelt;
   *  feilverdier her er kosmetisk feil, ikke crash. */
  count?: number;
}

export interface SearchOverlayContent {
  popularQueries: PopularQuery[];
  categoryShortcuts: CategoryShortcut[];
}

/**
 * Redaksjonell default. Holdt liten bevisst — 5 chips + 3 kategori-shortcuts
 * er nok til å fylle sidebar-en uten å dominere.
 * Kilde: Paper 8TL-0 sine placeholder-verdier.
 */
export const DEFAULT_SEARCH_OVERLAY: SearchOverlayContent = {
  popularQueries: [
    { label: 'kokkekniv 21cm', query: 'kokkekniv 21cm' },
    { label: 'VG10', query: 'VG10' },
    { label: 'japansk kokkekniv', query: 'japansk kokkekniv' },
    { label: 'Global kniv', query: 'Global' },
    { label: 'Wüsthof', query: 'Wüsthof' },
  ],
  categoryShortcuts: [
    { label: 'Kokkekniv / Gyuto', href: '/knivtyper/kokkekniv' },
    { label: 'Santoku', href: '/knivtyper/santoku' },
    { label: 'Knivblokk og oppbevaring', href: '/knivblokk-og-oppbevaring' },
  ],
};
