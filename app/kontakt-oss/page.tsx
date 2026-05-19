/**
 * /kontakt-oss — hjelp og kontakt (Paper 9WU-1).
 *
 * Siden er en RSC — alt innhold (kontaktkanaler, åpningstider, butikk-info)
 * er statisk og bor i `lib/contact/info.ts` som single source of truth. Den
 * samme dataen brukes i header-utility-bar og i ordre-bekreftelsesmailer, så
 * tekst-endringer skjer ett sted.
 *
 * Metadata: full OG-oppsett fordi kontakt-siden er ofte deep-linked fra
 * footer, Google Business-profiler og e-post-signaturer. `robots: index` er
 * default — vi VIL ha denne indeksert for direkte søk ("skarpekniver kontakt",
 * "skarpekniver mathallen").
 */

import type { Metadata } from 'next';

import { ContactPage } from '@/components/contact/ContactPage';
import { CONTACT_HERO_SUBTITLE, CONTACT_HERO_TITLE } from '@/lib/contact/info';

export const metadata: Metadata = {
  title: `${CONTACT_HERO_TITLE} — Kontakt oss`,
  description: CONTACT_HERO_SUBTITLE,
  alternates: {
    canonical: '/kontakt-oss',
  },
  openGraph: {
    title: 'Kontakt oss — Skarpe Kniver',
    description: CONTACT_HERO_SUBTITLE,
    type: 'website',
  },
};

export default function KontaktOssRoute() {
  return <ContactPage />;
}
