/**
 * Build-time default for den REDAKSJONELLE overlay-blobben.
 *
 * Merk (viktig!): Det finnes ikke lenger noe "resolved nav-primary"-fallback.
 * Bevisst fjernet — fallback-en maskerte sync-feil ved å vise en hardkodet
 * meny som så helt riktig ut og gjorde diagnose umulig. Hvis wp_menus er tom
 * eller fetch kaster, returnerer `getPrimaryNav()` nå `null` og `Header.tsx`
 * rendrer uten nav-items. Da er problemet synlig øyeblikkelig framfor å
 * skjule seg bak en statisk meny.
 *
 *   `DEFAULT_NAV_OVERLAY` — den redaksjonelle overlay-blobben som brukes
 *   hvis `site_config.nav_primary` mangler eller feiler schema-validering.
 *   Sammen med et fersk wp_menus-snapshot produserer resolveren en
 *   meningsfull meny. Dette er også seed-kilden for migrasjonen som
 *   oppretter raden første gang.
 *
 * Hvis du endrer denne, oppdater også JSON-seedet i
 * `supabase/migrations/<ts>_site_config.sql` så nye databaser får samme
 * startverdi. (Eller: edit i Supabase Studio etter første seed.)
 *
 * Kilde: `docs/components.md` > Header, basert på Paper `Friendly canyon`
 * artboards 9P-0 (header), BB-0 (mega menu Kniver), G2-0 (mobile drawer).
 */

import { NAV_OVERLAY_VERSION, type NavOverlay } from './schema';

// ---------- Default overlay (editorial) ------------------------------------

/**
 * Brukes hvis `site_config.nav_primary` mangler eller er korrupt, men
 * wp_menus-snapshot er tilgjengelig. Resolveren slår dette på top-level items
 * basert på normalisert pathname (href).
 *
 * Nøkler her må matche de faktiske paths-ene som WP-menyen leverer — se
 * `fetchMenuSnapshot` (strippet til pathname).
 */
export const DEFAULT_NAV_OVERLAY: NavOverlay = {
  version: NAV_OVERLAY_VERSION,
  utility: [
    'Gratis frakt over 1 500 kr',
    'Knivsliping i Oslo og per post',
    'Rask levering 1–3 virkedager',
  ],
  itemOverrides: {
    '/knivtyper': {
      label: 'Kniver',
      // overview er bevisst ikke satt — resolveren auto-bygger den fra
      // første level-1-gruppe i WP-menyen (se resolve.ts buildMega).
      editorial: {
        title: 'Redaksjonelt',
        card: {
          decorative: '包丁',
          title: 'Hvilken kniv passer for deg?',
          body: 'Vår guide hjelper deg finne rett kniv til ditt nivå og bruk.',
          cta: { label: 'Les vår knivguide →', href: '/guide/hvilken-kniv' },
        },
        services: {
          title: 'Tjenester',
          links: [
            { label: 'Knivsliping i Oslo', href: '/knivsliping/oslo' },
            { label: 'Knivsliping i posten', href: '/knivsliping/posten' },
            { label: 'Slipekurs — se datoer', href: '/slipekurs' },
          ],
        },
      },
    },

    '/bryner-og-knivsliping': {
      label: 'Bryner og sliping',
      editorial: {
        title: 'Redaksjonelt',
        card: {
          decorative: '砥石',
          title: 'Slik sliper du en kniv',
          body: 'Steg for steg fra grov til fin — slipevinkel, vannstein og finish.',
          cta: { label: 'Les sliping-guiden →', href: '/kniv-info/kategori/sliping' },
        },
        services: {
          title: 'Tjenester',
          links: [
            { label: 'Knivsliping i Oslo', href: '/knivsliping/oslo' },
            { label: 'Knivsliping i posten', href: '/knivsliping/posten' },
            { label: 'Slipekurs — se datoer', href: '/slipekurs' },
          ],
        },
      },
    },

    '/kjokkenutstyr': {
      label: 'Kjøkkenutstyr',
      editorial: {
        title: 'Redaksjonelt',
        card: {
          decorative: '道具',
          title: 'Mest populære redskapene i 2026',
          body: 'Det proff-kjøkkenene velger først — fra skjærebrett til pinsetter.',
          cta: { label: 'Se topp 10 →', href: '/kniv-info/topp-redskaper-2026' },
        },
        services: {
          title: 'Guider',
          links: [
            { label: 'Slik velger du skjærebrett', href: '/kniv-info/skjaerebrett-guide' },
            { label: 'Hvilke pinsetter passer hvor', href: '/kniv-info/pinsett-guide' },
            { label: 'Vedlikehold av tre-utstyr', href: '/kniv-info/vedlikehold-tre' },
          ],
        },
      },
    },

    '/japansk-grill': {
      label: 'Japansk grill',
      editorial: {
        title: 'Redaksjonelt',
        card: {
          decorative: '焼鳥',
          title: 'Det essensielle grillutstyret',
          body: 'Yakitori, kushi og binchotan — hva du faktisk trenger for å starte.',
          cta: { label: 'Se grill-guiden →', href: '/kniv-info/japansk-grill-guide' },
        },
        services: {
          title: 'Guider',
          links: [
            { label: 'Binchotan: trekull-bibelen', href: '/kniv-info/binchotan' },
            { label: 'Slik bygger du yakitori-meny', href: '/kniv-info/yakitori-meny' },
            { label: 'Vedlikehold av konro-grill', href: '/kniv-info/konro-vedlikehold' },
          ],
        },
      },
    },

    '/verktoy': {
      label: 'Verktøy',
      editorial: {
        title: 'Redaksjonelt',
        card: {
          decorative: '工具',
          title: 'Møt produsentene av japansk verktøy',
          body: 'Smedene og familiebedriftene bak utstyret vi anbefaler.',
          cta: { label: 'Les introduksjonen →', href: '/kniv-info/produsenter-japansk-verktoy' },
        },
        services: {
          title: 'Tjenester',
          links: [
            { label: 'Garanti og service', href: '/kundeservice/garanti' },
            { label: 'Reservedeler', href: '/kundeservice/reservedeler' },
            { label: 'Bruksveiledninger', href: '/kniv-info/kategori/bruksveiledninger' },
          ],
        },
      },
    },

    '/servering': {
      label: 'Servering',
      editorial: {
        title: 'Redaksjonelt',
        card: {
          decorative: '食器',
          title: 'Vinglass fra Riedel og Spiegelau',
          body: 'Hver glass-form er designet for én vintype — vi forklarer hvorfor.',
          cta: { label: 'Utforsk vinglass-seriene →', href: '/servering/glass' },
        },
        services: {
          title: 'Trender og guider',
          links: [
            { label: 'Årets trend: ramenboller', href: '/kniv-info/ramenboller-trend' },
            { label: 'Slik dekker du japansk-bord', href: '/kniv-info/japansk-borddekning' },
            { label: 'Sake-glass og karaffler', href: '/servering/sake' },
          ],
        },
      },
    },
  },
  virtualItems: [
    {
      label: 'Tilbud',
      href: '/tilbud',
      accent: true,
      position: 'end',
    },
  ],
};
