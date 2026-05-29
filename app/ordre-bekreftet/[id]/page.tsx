/**
 * /ordre-bekreftet/[id] — bestillingsbekreftelse-side (Paper 5U2-0 desktop /
 * 5Y8-0 mobile).
 *
 * Server-shell. Når Woo-order-push er koblet på, vil denne siden:
 *   1. Lese order-id fra params.
 *   2. Hente full ordredata fra Woo via `wcGetOrder(id)`.
 *   3. Sende dataen til klient-view'et.
 *
 * Inntil API-en er på plass, brukes en static demo-fixture som matcher
 * Paper-screenshotet pixel-perfect.
 */

import type { Metadata } from 'next';

import { OrderConfirmedView } from '@/components/checkout/OrderConfirmedView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ordre bekreftet — THORN FIT',
  description: 'Takk for bestillingen din.',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderConfirmedPage({ params }: PageProps) {
  const { id } = await params;
  return <OrderConfirmedView orderId={id} />;
}
