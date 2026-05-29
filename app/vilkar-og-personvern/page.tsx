/**
 * /vilkar-og-personvern — juridisk-side (Vilkår + Personvern + Retur + Frakt
 * + Cookies + Kontakt).
 *
 * Layoutet switcher mellom to presentations-komponenter via Tailwind-klasser
 * (`hidden md:block` / `md:hidden`) slik at begge variantene blir rendret
 * server-side. Det gir:
 *   - SEO-boost: all juridisk copy er synlig i HTML-en uavhengig av viewport,
 *     så Google indekserer fullt innhold (viktig for juridiske sider som
 *     typisk er deep-linked).
 *   - Responsivt uten `use client` på desktop: desktop-varianten er en RSC
 *     (ingen state), mens kun mobile-komponenten hydrerer på små skjermer.
 *
 * Metadata: full OG-oppsett siden siden ofte er deep-linked fra footer og
 * fra ordre-bekreftelses-mailer. `robots: index` er default — vi VIL ha
 * denne indeksert for direct search queries ("skarpekniver angrerett").
 */

import type { Metadata } from 'next';

import { LegalPageDesktop } from '@/components/legal/LegalPageDesktop';
import { LegalPageMobile } from '@/components/legal/LegalPageMobile';
import { LEGAL_HERO_INTRO } from '@/lib/legal/sections';

export const metadata: Metadata = {
  title: 'Vilkår og personvern',
  description: LEGAL_HERO_INTRO,
  alternates: {
    canonical: '/vilkar-og-personvern',
  },
  openGraph: {
    title: 'Vilkår og personvern — THORN FIT',
    description: LEGAL_HERO_INTRO,
    type: 'article',
  },
};

export default function VilkarOgPersonvernRoute() {
  return (
    <>
      <div className="hidden md:block">
        <LegalPageDesktop />
      </div>
      <div className="md:hidden">
        <LegalPageMobile />
      </div>
    </>
  );
}
