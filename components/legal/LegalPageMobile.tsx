'use client';

/**
 * LegalPageMobile — mobil-oppsett for /vilkar-og-personvern (Paper 7NV-0).
 *
 * Full-bredde stack med:
 *   1. Hero (Juridisk / tittel / sist oppdatert)
 *   2. Horisontalt scrollbar tab-rad (6 tabs)
 *   3. Aktiv-seksjonens content (kun én seksjon om gangen — mobil har ikke
 *      plass til stacked layout)
 *
 * 'use client' fordi tab-swap er lokal state. Vi speiler *ikke* valget i
 * URL-en — for jura-siden er det ingen verdi i deep-links til "siste tab"
 * (sjeldent gjenbesøkt, og alt content er likevel tilgjengelig via scroll
 * på desktop for SEO). Hvis vi vil støtte deep-links senere, legg til
 * `?section=<id>` via replaceState (samme mønster som useFilterUrlState).
 *
 * Tabs er `role="tablist"`/`role="tab"`/`role="tabpanel"` for skjermlesere,
 * og arrow-key-navigasjon er wire-et opp inline for å matche WAI-ARIA
 * authoring practices (venstre/høyre piltast bytter tab).
 */

import { useCallback, useRef, useState } from 'react';

import { Kjopsbetingelser } from './sections/Kjopsbetingelser';
import { Personvernerklaering } from './sections/Personvernerklaering';
import { ReturReklamasjon } from './sections/ReturReklamasjon';
import { FraktLevering } from './sections/FraktLevering';
import { Informasjonskapsler } from './sections/Informasjonskapsler';
import { KontaktOss } from './sections/KontaktOss';
import {
  LEGAL_LAST_UPDATED,
  LEGAL_SECTIONS,
  type LegalSectionId,
} from '@/lib/legal/sections';

const SECTION_COMPONENTS: Record<
  LegalSectionId,
  React.ComponentType<{ density: 'compact' }>
> = {
  kjopsbetingelser: (props) => <Kjopsbetingelser {...props} />,
  personvern: (props) => <Personvernerklaering {...props} />,
  retur: (props) => <ReturReklamasjon {...props} />,
  frakt: (props) => <FraktLevering {...props} />,
  cookies: (props) => <Informasjonskapsler {...props} />,
  kontakt: (props) => <KontaktOss {...props} />,
};

export function LegalPageMobile() {
  const [active, setActive] = useState<LegalSectionId>('kjopsbetingelser');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const activeIdx = LEGAL_SECTIONS.findIndex((s) => s.id === active);
  const ActiveSection = SECTION_COMPONENTS[active];

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const dir = e.key === 'ArrowLeft' ? -1 : 1;
      const nextIdx =
        (activeIdx + dir + LEGAL_SECTIONS.length) % LEGAL_SECTIONS.length;
      const next = LEGAL_SECTIONS[nextIdx].id;
      setActive(next);
      tabRefs.current[next]?.focus();
    },
    [activeIdx],
  );

  return (
    <>
      {/* Hero — Paper 7NV-0: aka-kicker (ikke haiiro som desktop), kompakt h2,
          dato-linje under. Full-width white bg med bottom-divider. */}
      <header className="border-b border-divider bg-surface px-sp-3 pt-sp-6 pb-sp-5">
        <div className="flex flex-col gap-sp-2">
          <span className="text-label font-bold uppercase text-aka">
            Juridisk
          </span>
          <h1 className="text-h2 font-bold text-ink">Vilkår og personvern</h1>
          <p className="text-muted-sm text-ink-muted">
            Sist oppdatert: {LEGAL_LAST_UPDATED}
          </p>
        </div>
      </header>

      {/* Tab-rad — horizontal scroll, scrollbar-hidden. `role="tablist"`
          gjør NVDA/VoiceOver annonsere som tab-navigation. */}
      <div
        role="tablist"
        aria-label="Seksjoner"
        onKeyDown={onKeyDown}
        className="flex overflow-x-auto border-b border-divider bg-surface"
      >
        {LEGAL_SECTIONS.map((s) => {
          const isActive = s.id === active;
          return (
            <button
              key={s.id}
              ref={(el) => {
                tabRefs.current[s.id] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${s.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${s.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActive(s.id)}
              className={[
                'flex h-11 shrink-0 items-center border-b-2 px-sp-3 text-body-xs transition-colors',
                isActive
                  ? 'border-ink font-bold text-ink'
                  : 'border-transparent text-ink-muted hover:text-ink',
              ].join(' ')}
            >
              {s.mobileLabel}
            </button>
          );
        })}
      </div>

      {/* Panel — kun aktiv seksjon */}
      <section
        role="tabpanel"
        id={`panel-${active}`}
        aria-labelledby={`tab-${active}`}
        className="bg-surface px-sp-3 pt-sp-6 pb-sp-8"
      >
        <ActiveSection density="compact" />
      </section>
    </>
  );
}
