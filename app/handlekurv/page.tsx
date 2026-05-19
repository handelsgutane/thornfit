/**
 * /handlekurv — handlekurv-siden.
 *
 * Server-component shell med `<CartPage />` (client) som rendrer alt
 * funksjonelt. Vi har ingen server-state å serve her — cart bor i
 * localStorage (ADR-0011) og alt handles klient-side.
 *
 * **`noindex`:** Kurven er personlig/stateful — ingen grunn for Google å
 * indeksere den. Viktig at 301-kartet ikke peker gamle /handlekurv-URLer hit
 * som indekserbare (mer en metadata-spørsmål enn en redirect-regel).
 */

import type { Metadata } from 'next';

import { CartPage } from '@/components/cart/CartPage';

export const metadata: Metadata = {
  title: 'Handlekurv',
  robots: {
    index: false,
    follow: true,
  },
};

// Alltid client-state — ingen SSG.
export const dynamic = 'force-dynamic';

export default function HandlekurvRoute() {
  return <CartPage />;
}
