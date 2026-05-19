'use client';

/**
 * LegalToc — sticky TOC-sidebar for /vilkar-og-personvern desktop (Paper 7AQ-0).
 *
 * **Scroll-spy:** aktiv-state følger den seksjonen som nettopp har blitt
 * scrollet forbi "aktiv-linjen" — ~100px fra toppen av viewporten (under det
 * sticky page-headeret). Vi bruker en rAF-throttlet scroll-handler i stedet
 * for IntersectionObserver fordi:
 *   - Seksjonene varierer voldsomt i høyde (juridisk copy), og IO-thresholds
 *     gir "hull" der ingen seksjon registreres som mest-visible.
 *   - Vi trenger et deterministisk svar på "hvilken seksjon er brukeren på
 *     akkurat nå", og den direkte scroll-posisjon-sjekken gir det gratis.
 *
 * **Hvorfor klient-komponent:** TOC-aktiv-state må reagere på scroll, som
 * krever DOM-tilgang. `'use client'` er isolert til denne subtreet — resten
 * av `LegalPageDesktop` er fortsatt RSC, så copy-seksjonene serveres som
 * pre-rendret HTML (SEO intakt).
 *
 * **Active-linjen:** `HEADER_OFFSET = 100px` = 72px site-header + 28px
 * pusterom. Seksjoner vinner aktiv-state når deres top passerer denne linjen
 * nedover (dvs. brukeren har scrollet forbi seksjonens starttekst).
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  LEGAL_CONTACT,
  LEGAL_SECTIONS,
  type LegalSectionId,
} from '@/lib/legal/sections';

// 72px sticky site-header + 28px pusterom. Matcher `scroll-padding-top` i
// globals.css (som bruker 72+16=88), men vi er litt mer sjenerøse her slik
// at aktiv-linjen ligger trygt _under_ headeret når TOC-lenken klikkes.
const HEADER_OFFSET = 100;

export function LegalToc() {
  const [activeId, setActiveId] = useState<LegalSectionId>(
    LEGAL_SECTIONS[0].id,
  );

  useEffect(() => {
    // Cache DOM-oppslag utenfor computeActive — listen endres ikke mellom
    // renders, og getElementById er billig men ikke gratis.
    const sections = LEGAL_SECTIONS.map((s) => ({
      id: s.id,
      el: document.getElementById(s.id),
    })).filter((x): x is { id: LegalSectionId; el: HTMLElement } =>
      x.el !== null,
    );

    if (sections.length === 0) return;

    const computeActive = () => {
      // Default: første seksjon (hvis vi er over alle sections' top).
      let current: LegalSectionId = sections[0].id;
      for (const { id, el } of sections) {
        const rect = el.getBoundingClientRect();
        if (rect.top - HEADER_OFFSET <= 0) {
          // Denne seksjonen har passert aktiv-linjen — kandidat.
          // Vi fortsetter loopen så senere seksjoner kan overta; break så
          // snart en seksjon ikke har passert, for kortslutning.
          current = id;
        } else {
          break;
        }
      }
      setActiveId((prev) => (prev === current ? prev : current));
    };

    // Initial compute — i tilfelle siden lastes med hash eller scroll-offset.
    computeActive();

    // rAF-throttling: scroll-events fyrer ofte (~60-120Hz på trackpad). Vi
    // bundler opp til én sjekk per frame, som er mer enn nok for TOC-state.
    let rafId = 0;
    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        computeActive();
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <nav
      aria-label="Innholdsfortegnelse"
      className="sticky top-sp-8 flex flex-col gap-sp-1"
    >
      <div className="mb-sp-1 border-b border-divider pb-sp-3">
        {/* "Innhold"-headeren skal stå i full `text-ink` (ikke muted) så den
            matcher vekten til de andre seksjons-tittlene i sidebar. */}
        <span className="text-label font-bold uppercase text-ink">
          Innhold
        </span>
      </div>
      {LEGAL_SECTIONS.map((s) => {
        const isActive = s.id === activeId;
        return (
          <Link
            key={s.id}
            href={`#${s.id}`}
            aria-current={isActive ? 'location' : undefined}
            className={[
              'flex items-center py-sp-2 transition-colors',
              isActive
                ? 'border-l-2 border-ink bg-surface-muted px-sp-3 text-body-xs font-bold text-ink'
                : 'border-l-2 border-transparent pl-sp-3 pr-sp-3 text-body-xs text-ink-muted hover:text-ink',
            ].join(' ')}
          >
            {s.title}
          </Link>
        );
      })}
      <div className="mt-sp-4 flex flex-col gap-sp-1 border-t border-divider pt-sp-3">
        <span className="text-body-xs font-bold text-ink">Spørsmål?</span>
        <a
          href={`mailto:${LEGAL_CONTACT.email}`}
          className="text-muted-sm leading-relaxed text-ink-muted transition-colors hover:text-ink"
        >
          {LEGAL_CONTACT.email}
        </a>
        <a
          href={`tel:${LEGAL_CONTACT.phone.replace(/\s/g, '')}`}
          className="text-muted-sm leading-relaxed text-ink-muted transition-colors hover:text-ink"
        >
          {LEGAL_CONTACT.phone}
        </a>
      </div>
    </nav>
  );
}
