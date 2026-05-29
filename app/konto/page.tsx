/**
 * /konto — innlogget landing.
 *
 * Doble responser:
 *   - Desktop (≥lg): rendres som "Mine ordrer"-siden med persistent
 *     sidebar via `AccountShell`. Dette matcher Paper 6B7-0 hvor
 *     /konto-roten på desktop er Mine ordrer.
 *   - Mobile (<lg): rendres som hub-meny (Paper 7SO-0) — uten sidebar.
 *
 * For å unngå en ekstra route-prerender (og for å holde URL stabil) lar vi
 * begge variantene rendres samtidig og bytter visning via CSS (`hidden lg:*`
 * og `lg:hidden`). RSC betaler for begge, men det er kun én HTML-tree så
 * det er rimelig — dataene som trengs er like.
 *
 * Auth-gate: ikke-autentiserte brukere redirectes til /konto/logg-inn med
 * returnUrl satt slik at de lander tilbake her etter login.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AccountMobileHub } from '@/components/account/AccountMobileHub';
import { AccountShell } from '@/components/account/AccountShell';
import { OrdersView } from '@/components/account/OrdersView';
import { getSessionUser } from '@/lib/auth/session';
import { fetchUserOrders } from '@/lib/woo/orders';

export const metadata: Metadata = {
  title: 'Min konto — THORN FIT',
  robots: { index: false, follow: false },
  alternates: { canonical: '/konto' },
};

export const dynamic = 'force-dynamic';

export default async function KontoRoute() {
  const user = await getSessionUser();
  if (!user) {
    redirect('/konto/logg-inn?returnUrl=%2Fkonto');
  }

  const orders = await fetchUserOrders(user.id);

  return (
    <>
      {/* Mobile — hub-meny */}
      <AccountMobileHub user={user} />

      {/* Desktop — sidebar + Mine ordrer */}
      <div className="hidden lg:block">
        <AccountShell user={user} activeId="orders">
          <OrdersView orders={orders} />
        </AccountShell>
      </div>
    </>
  );
}
