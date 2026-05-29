/**
 * Footer — global side-footer, Paper 2AJ-0 "Component — Footer".
 *
 * Tre-rads layout:
 *   Rad 1 (footer-top):     Logo + tagline (venstre)  |  Nyhetsbrev (høyre)
 *   Rad 2 (nav-columns):    5 kolonner med kategorilenker
 *   Rad 3 (footer-bottom):  Copyright · Legal-lenker · Sosiale medier
 *
 * Tema-strategi (ADR-0008):
 *   Footeren er brand-fixed mørk — flipper IKKE med lys/mørk tema. Bevisst
 *   valg slik at "foten" av siden alltid fungerer som visuell ankring uansett
 *   om brukeren har lys eller mørk modus. Samme mønster som drawer-overlay,
 *   aka-CTA-er og logo-sirkelen. Bruker derfor brand-tokens (`bg-kuro`,
 *   `text-unohana`, `text-haiiro`) fremfor semantic tokens (`bg-surface`,
 *   `text-ink`).
 *
 * Paper-refs (sentrale):
 *   - 2AJ-0  Wrapper — bg kuro (#1A1A1A), w-1440 h-560 på desktop
 *   - 2AK-0  footer-top — padding t-64 b-56 px-80
 *   - 2AV-0  nav-columns — padding pb-56 px-80, 5 like kolonner
 *   - 2BQ-0  footer-bottom — border-top footer-divider (#2A2520), py-20 px-80
 *   - 2AX-0  Kolonne-heading — label (11px uppercase, tracking 0.1em, unohana)
 *   - 2AY-0  Kolonne-lenke — body-sm (14px/20), haiiro
 *
 * Responsivitet:
 *   - Mobil (<md): Nyhetsbrev flyttes under logo-blokken, kolonnene blir
 *     2×3-grid. Bunn-raden stabler i 3 sentrerte rader.
 *   - Tablet (md): Samme som desktop, men grid blir 3-kolonner og siste
 *     2 kolonner rutcher ned på ny rad.
 *   - Desktop (lg): Paper 1:1 — 5 kolonner side-ved-side.
 *
 * Lenke-strategi:
 *   Alle URL-er er definert i `lib/footer/config.ts`. Rader med `href: '#'`
 *   markerer TODO — vi rendrer dem som statiske tekstnoder med `cursor-default`
 *   så ingen klikker seg ut i ingenting. `data-todo` attribute synliggjør dem
 *   i DevTools uten å påvirke brukeropplevelsen.
 */

import Link from 'next/link';

import { Logo } from '@/components/brand/Logo';
import {
  FOOTER_COLUMNS,
  FOOTER_COMPANY,
  FOOTER_LEGAL_LINKS,
  FOOTER_SOCIALS,
  type FooterLink,
  type FooterSocial,
} from '@/lib/footer/config';
import { getFooterNav, type FooterColumn } from '@/lib/nav/fetch';

import { FooterNewsletter } from './FooterNewsletter';

/**
 * Renderer en lenke hvis `href !== '#'`, ellers en statisk `<span>`. Holder
 * lesbarheten i JSX-hoveddelen lav og sikrer at TODO-lenker ikke navigerer.
 * I dev-bygg setter vi `data-todo` så vi ser hvilke som mangler ekte URL.
 */
function FooterLinkItem({
  link,
  className,
}: {
  link: FooterLink;
  className: string;
}) {
  if (link.href === '#') {
    return (
      <span
        className={`${className} cursor-default`}
        data-todo={
          process.env.NODE_ENV === 'production' ? undefined : link.todo ?? 'TODO'
        }
      >
        {link.label}
      </span>
    );
  }
  return (
    <Link href={link.href} className={className}>
      {link.label}
    </Link>
  );
}

/**
 * Social-ikon — rendres som 18×18 SVG med stroke satt til footer-subtle.
 * Hover løfter til unohana så det føles interaktivt selv med dempet base.
 * Inline-SVG fremfor `lucide-react` her — ikonene i Paper har egne
 * kontur-metrikker som matcher resten av footer-typografien, og vi unngår
 * å importere et helt ikon-bibliotek bare for 3 stk.
 */
function SocialIcon({ icon }: { icon: FooterSocial['icon'] }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true,
    focusable: false,
  } as const;
  if (icon === 'instagram') {
    return (
      <svg {...common}>
        <rect x="2" y="2" width="20" height="20" rx="5" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="17" cy="7" r="1" fill="currentColor" />
      </svg>
    );
  }
  if (icon === 'x') {
    // X/Twitter "bird" — ikonet Paper bruker er fortsatt fugl-stilen, ikke
    // det nye X-glyph-en. Vi følger designet (2C3-0) inntil Alexander
    // beslutter om X fortsatt er relevant kanal.
    return (
      <svg {...common}>
        <path
          d="M22 4s-2.5 1.5-4 2c-.9-1-2.2-1.5-3.5-1.5C11.5 4.5 9.5 6.7 9.5 9.5v1C6 10.5 3 8.5 2 6c0 0-2 4.5 2 7-1 0-2-.5-3-1.5 0 3 2 5.5 5 6-1 0-2 0-3-.5.5 2.5 3 4 5.5 4C6 23 3 24 0 23c3 2 6.5 3 10 3 12 0 18-10 18-18.5V7c1-.7 2-1.7 3-3l-9 3z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  // facebook
  return (
    <svg {...common}>
      <path
        d="M22 12c0-5.5-4.5-10-10-10S2 6.5 2 12c0 5 3.7 9.1 8.4 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7C18.3 21.1 22 17 22 12z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Konverter WP-menu-kolonnene til samme shape som FOOTER_COLUMNS-config så
 * resten av render-koden ikke trenger å vite om kilden er WP eller fallback-
 * config. Tom WP-href ('#') beholdes — `FooterLinkItem` rendrer da en
 * statisk `<span>` (samme oppførsel som TODO-config-lenker).
 */
function wpColumnsToFooterColumns(cols: FooterColumn[]) {
  return cols.map((c) => ({
    heading: c.heading,
    links: c.links.map((l) => ({ label: l.label, href: l.href })),
  }));
}

export async function Footer() {
  const currentYear = new Date().getFullYear();

  // Hent WP-menu (1035) → kolonner. Fall tilbake til hardkodet config
  // hvis snapshot mangler eller cache-fetch feiler — vi vil aldri ha en
  // tom footer på live (SEO + brukeropplevelse).
  const wpColumns = await getFooterNav();
  const columns =
    wpColumns && wpColumns.length > 0
      ? wpColumnsToFooterColumns(wpColumns)
      : FOOTER_COLUMNS;

  return (
    <footer
      className={[
        'mt-auto w-full bg-kuro' /* brand-fixed: alltid mørk uansett tema */,
        'text-haiiro' /* default body-farge i footer (Paper 6B6B65) */,
      ].join(' ')}
    >
      {/* ================================================================ */}
      {/* Rad 1 — logo + tagline + nyhetsbrev                               */}
      {/* ================================================================ */}
      <div
        className={[
          'mx-auto flex max-w-content flex-col gap-sp-6',
          'px-sp-4 pt-sp-7 pb-sp-6 sm:px-sp-7',
          'md:flex-row md:items-start md:justify-between md:gap-sp-6' /* paper-exact: 2AK-0 layout på ≥md */,
        ].join(' ')}
      >
        <div className="flex flex-col gap-sp-3">
          <Link href="/" aria-label="THORN FIT — til forsiden" className="inline-block">
            {/* Logo bruker currentColor — i footer vil vi ha wordmark i unohana
                (light tekst på dark bg). Stacked-logo (400×220) — h-12 (48px)
                gir ~87×48 bredde, passer footer-hierarkiet. */}
            <Logo className="h-12 w-auto text-unohana" title="ThornFit" />
          </Link>
          <p className="max-w-70 text-body-sm text-haiiro">
            {FOOTER_COMPANY.tagline}
          </p>
        </div>

        <FooterNewsletter />
      </div>

      {/* ================================================================ */}
      {/* Rad 2 — kategori-kolonner                                          */}
      {/* ================================================================ */}
      <nav
        aria-label="Footer-navigasjon"
        className={[
          'mx-auto max-w-content',
          'px-sp-4 pb-sp-7 sm:px-sp-7',
        ].join(' ')}
      >
        <div
          className={[
            'grid gap-sp-6',
            'grid-cols-2 md:grid-cols-3 lg:grid-cols-5' /* paper-exact: 2AV-0 5-col på lg+ */,
          ].join(' ')}
        >
          {columns.map((column) => (
            <div key={column.heading} className="flex flex-col gap-sp-2">
              <h3
                className={[
                  'uppercase tracking-widest' /* paper-exact: 2AX-0 label 11px tracking 0.1em */,
                  'text-label font-medium text-unohana',
                  'mb-sp-1',
                ].join(' ')}
              >
                {column.heading}
              </h3>
              <ul className="flex flex-col gap-sp-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <FooterLinkItem
                      link={link}
                      className={[
                        'text-body-sm text-haiiro',
                        'transition-colors hover:text-unohana',
                        'focus:outline-none focus-visible:text-unohana focus-visible:underline focus-visible:underline-offset-4',
                      ].join(' ')}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {/* ================================================================ */}
      {/* Rad 3 — copyright + legal + socials                               */}
      {/* ================================================================ */}
      <div className="border-t border-footer-divider">
        <div
          className={[
            'mx-auto flex max-w-content flex-col items-center gap-sp-3',
            'px-sp-4 py-sp-3 sm:px-sp-7',
            'md:flex-row md:justify-between md:gap-sp-4' /* paper-exact: 2BQ-0 layout */,
          ].join(' ')}
        >
          <p className="text-body-xs text-footer-subtle text-center md:text-left">
            © {currentYear} {FOOTER_COMPANY.legalName}
            {/* MVA-nummer vises komma-separert etter firmanavn — samme
                stil som live-footeren (2026-04-24). Hjelper kunder finne
                oss i Brønnøysund og oppfyller e-handelsloven §8. */}
            {' · '}
            <span className="whitespace-nowrap">MVA {FOOTER_COMPANY.vatNumber}</span>
          </p>
          <ul className="flex flex-wrap items-center justify-center gap-x-sp-4 gap-y-sp-2">
            {FOOTER_LEGAL_LINKS.map((link) => (
              <li key={link.label}>
                <FooterLinkItem
                  link={link}
                  className={[
                    'text-body-xs text-footer-subtle',
                    'transition-colors hover:text-unohana',
                    'focus:outline-none focus-visible:text-unohana focus-visible:underline focus-visible:underline-offset-4',
                  ].join(' ')}
                />
              </li>
            ))}
          </ul>
          <ul className="flex items-center gap-sp-4">
            {FOOTER_SOCIALS.map((social) => {
              const isTodo = social.href === '#';
              const iconClass =
                'inline-flex h-5 w-5 items-center justify-center text-footer-subtle transition-colors hover:text-unohana focus:outline-none focus-visible:text-unohana';
              return (
                <li key={social.label}>
                  {isTodo ? (
                    <span
                      aria-label={social.label}
                      className={`${iconClass} cursor-default`}
                      data-todo={
                        process.env.NODE_ENV === 'production'
                          ? undefined
                          : social.todo ?? 'TODO'
                      }
                    >
                      <SocialIcon icon={social.icon} />
                    </span>
                  ) : (
                    <a
                      href={social.href}
                      aria-label={social.label}
                      target="_blank"
                      rel="noopener noreferrer me"
                      className={iconClass}
                    >
                      <SocialIcon icon={social.icon} />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </footer>
  );
}
