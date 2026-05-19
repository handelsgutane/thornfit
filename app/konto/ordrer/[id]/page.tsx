/**
 * /konto/ordrer/[id] — Ordredetalj (Paper 6GT-0 desktop / 7UX-0 mobile).
 *
 * Viser én ordre med full detalj — produktliste, totals-breakdown, fakturerings-
 * og leveringsadresse, betaling, melding fra kunde, og en avledet ordre-timeline
 * (kun desktop).
 *
 * Auth-gate:
 *   - Ingen session  → redirect til `/konto/logg-inn?returnUrl=...`
 *   - Ugyldig orderId / annen kundes ordre / Woo-feil → 404 via `notFound()`
 *
 * Vi setter eksplisitt 404 i stedet for å vise tom side så crawlere ikke
 * indekserer ikke-eksisterende ordre-IDer (som om noen prøver å bruteforce
 * `/konto/ordrer/12345`).
 */

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { AccountShell } from '@/components/account/AccountShell';
import { OrderDetailView } from '@/components/account/OrderDetailView';
import { getSessionUser } from '@/lib/auth/session';
import { fetchUserOrder } from '@/lib/woo/orders';

interface OrderDetailRouteProps {
  readonly params: Promise<{ readonly id: string }>;
}

export const metadata: Metadata = {
  // Dynamisk title settes ikke per ordre — ordrenummer er sensitivt nok at vi
  // holder det utenfor `<title>`. Robots blokkerer alt under /konto uansett.
  title: 'Ordredetalj — Skarpe Kniver',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function OrderDetailRoute({ params }: OrderDetailRouteProps) {
  const { id } = await params;

  const orderId = Number(id);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    notFound();
  }

  const user = await getSessionUser();
  if (!user) {
    redirect(
      `/konto/logg-inn?returnUrl=${encodeURIComponent(`/konto/ordrer/${id}`)}`,
    );
  }

  const order = await fetchUserOrder(user.id, orderId);
  if (!order) {
    notFound();
  }

  return (
    <AccountShell user={user} activeId="orders">
      <OrderDetailView order={order} />
    </AccountShell>
  );
}
