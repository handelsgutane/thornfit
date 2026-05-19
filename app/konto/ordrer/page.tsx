/**
 * /konto/ordrer — Mine ordrer (Paper 6B7-0 desktop, 7UR-0 mobile).
 *
 * Eksplisitt URL for ordrelisten — matcher hub-rad-href på mobil og er
 * den siden /konto-roten desktopen viser. Vi kan dermed dyplinke til
 * ordre-listen fra e-post-bekreftelser uten å gå via /konto-roten.
 *
 * Layout-forskjell vs /konto-roten:
 *   - Desktop er identisk (sidebar + OrdersView)
 *   - Mobile rendrer også OrdersView (full-bleed cards-liste), IKKE hub-en.
 *     Hub-en er bare for `/konto`-roten.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AccountShell } from '@/components/account/AccountShell';
import { OrdersView } from '@/components/account/OrdersView';
import { ORDERS_TITLE } from '@/lib/account/info';
import { getSessionUser } from '@/lib/auth/session';
import { fetchUserOrders } from '@/lib/woo/orders';

export const metadata: Metadata = {
  title: `${ORDERS_TITLE} — Skarpe Kniver`,
  robots: { index: false, follow: false },
  alternates: { canonical: '/konto/ordrer' },
};

export const dynamic = 'force-dynamic';

export default async function OrdrerRoute() {
  const user = await getSessionUser();
  if (!user) {
    redirect('/konto/logg-inn?returnUrl=%2Fkonto%2Fordrer');
  }

  const orders = await fetchUserOrders(user.id);

  return (
    <AccountShell user={user} activeId="orders">
      <OrdersView orders={orders} />
    </AccountShell>
  );
}
