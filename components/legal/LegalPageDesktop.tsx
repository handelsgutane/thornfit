/**
 * LegalPageDesktop — desktop-oppsett for /vilkar-og-personvern (Paper 7AQ-0).
 *
 * To-kolonne layout: sticky TOC til venstre (240px), sections-kort til høyre.
 * Alle seks seksjoner rendres i samme kort (white bg, sakai border, 48px
 * padding) — TOC-klikk scroller til `#id`-ankere (native smooth-scroll via
 * CSS `scroll-behavior: smooth` på html).
 *
 * Active-state i TOC-en er ikke dynamisk her — vi kunne wire opp en scroll-
 * spy senere, men Paper-designet viser "Kjøpsbetingelser" aktiv som default,
 * og det er en rimelig first-paint approximation. Ved scroll-ned er det lite
 * kognitivt tap siden H2-en står like over.
 *
 * RSC: ingen state nødvendig (anchor-lenker er native). Mobile-varianten er
 * 'use client' fordi tab-swap krever lokal state.
 */

import { LegalToc } from './LegalToc';
import { Kjopsbetingelser } from './sections/Kjopsbetingelser';
import { Personvernerklaering } from './sections/Personvernerklaering';
import { ReturReklamasjon } from './sections/ReturReklamasjon';
import { FraktLevering } from './sections/FraktLevering';
import { Informasjonskapsler } from './sections/Informasjonskapsler';
import { KontaktOss } from './sections/KontaktOss';
import {
  LEGAL_HERO_INTRO,
  LEGAL_LAST_UPDATED,
  LEGAL_SECTIONS,
  type LegalSectionId,
} from '@/lib/legal/sections';

const SECTION_COMPONENTS: Record<
  LegalSectionId,
  React.ComponentType<{ density: 'full' }>
> = {
  kjopsbetingelser: (props) => <Kjopsbetingelser {...props} />,
  personvern: (props) => <Personvernerklaering {...props} />,
  retur: (props) => <ReturReklamasjon {...props} />,
  frakt: (props) => <FraktLevering {...props} />,
  cookies: (props) => <Informasjonskapsler {...props} />,
  kontakt: (props) => <KontaktOss {...props} />,
};

export function LegalPageDesktop() {
  return (
    <>
      {/* Hero-band — full-width white bg, bottom-border, page-header-container
          har samme horisontal padding som resten av appen (px-sp-7 = 64px). */}
      <header className="border-b border-divider bg-surface px-sp-7 pt-sp-7 pb-sp-6">
        <div className="flex flex-col gap-sp-2">
          <span className="text-label font-bold uppercase text-ink-muted">
            Juridisk
          </span>
          <h1 className="text-h1 font-bold text-ink">Vilkår og personvern</h1>
          <p className="max-w-(--width-hero-text) text-body leading-relaxed text-ink-muted">
            {LEGAL_HERO_INTRO}
          </p>
          <p className="mt-sp-1 text-body-xs text-ink-muted">
            Sist oppdatert: {LEGAL_LAST_UPDATED}
          </p>
        </div>
      </header>

      {/* Body — canvas bg (tinted), TOC + card-grid.
          NB: `<aside>` må IKKE ha `self-start` — det kolapser aside-høyden
          til nav-innholdet, som gir sticky-elementet ingen parent-range å
          skli innenfor (sticky feiler da silently). Default `stretch` gjør
          at aside matcher `<article>`-høyden (alle seksjoner stacket), så
          navet faktisk holder seg festet mens man scroller.
          `top-sp-8` = 96px = 72px (sticky site-header) + 24px pusterom. */}
      <div className="grid grid-cols-[var(--width-legal-toc)_1fr] gap-sp-7 bg-canvas px-sp-7 py-sp-7">
        <aside>
          {/* Sticky TOC + scroll-spy. Isolert `'use client'` — resten av
              denne siden er fortsatt RSC, så copy-seksjonene serveres som
              pre-rendret HTML (SEO intakt). */}
          <LegalToc />
        </aside>

        <article className="flex min-w-0 flex-col gap-sp-6 overflow-clip rounded-2 border border-divider bg-surface p-sp-6">
          {LEGAL_SECTIONS.map((s) => {
            const Section = SECTION_COMPONENTS[s.id];
            return (
              <section
                key={s.id}
                id={s.id}
                // Scroll-offset håndteres globalt via `html { scroll-padding-top }`
                // i globals.css (72px sticky-header + 16px pusterom).
                className="flex flex-col gap-sp-5"
                aria-labelledby={`${s.id}-heading`}
              >
                <div className="flex flex-col gap-sp-2 border-b-2 border-ink pb-sp-4">
                  <span className="text-label font-bold uppercase text-ink-muted">
                    {s.number}
                  </span>
                  <h2
                    id={`${s.id}-heading`}
                    className="text-h2 font-bold text-ink"
                  >
                    {s.title}
                  </h2>
                </div>
                <Section density="full" />
              </section>
            );
          })}
        </article>
      </div>
    </>
  );
}
