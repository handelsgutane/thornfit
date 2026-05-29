/**
 * /konto/personlig-informasjon — Paper 6GP-0 (desktop) / 7UT-0 (mobile).
 *
 * Skjermen lar bruker oppdatere navn, e-post, telefon, fødselsdato og bytte
 * passord. Faktiske API-endepunkter er ikke wired ennå — `PersonligInformasjonView`
 * har TODO-markører som peker mot `/api/auth/profile` og `/api/auth/password`.
 *
 * Auth-gate: redirect til `/konto/logg-inn` hvis ingen session — samme pattern
 * som `/konto/ordrer`.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AccountShell } from '@/components/account/AccountShell';
import { PersonligInformasjonView } from '@/components/account/PersonligInformasjonView';
import { ACCOUNT_NAV } from '@/lib/account/info';
import { getSessionUser } from '@/lib/auth/session';

const ITEM = ACCOUNT_NAV.find((i) => i.id === 'profile')!;

export const metadata: Metadata = {
  title: `${ITEM.label} — THORN FIT`,
  robots: { index: false, follow: false },
  alternates: { canonical: ITEM.href },
};

export const dynamic = 'force-dynamic';

export default async function PersonligInformasjonRoute() {
  const user = await getSessionUser();
  if (!user) {
    redirect(`/konto/logg-inn?returnUrl=${encodeURIComponent(ITEM.href)}`);
  }

  return (
    <AccountShell user={user} activeId="profile">
      <PersonligInformasjonView user={user} />
    </AccountShell>
  );
}
