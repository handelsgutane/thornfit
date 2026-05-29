/**
 * /konto/innstillinger — placeholder. Tema-toggle, varslings-preferanser
 * og slett-konto kommer i settings-milestonen.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AccountShell } from '@/components/account/AccountShell';
import { SettingsView } from '@/components/account/SettingsView';
import { ACCOUNT_NAV } from '@/lib/account/info';
import { getSessionUser } from '@/lib/auth/session';

const ITEM = ACCOUNT_NAV.find((i) => i.id === 'settings')!;

export const metadata: Metadata = {
  title: `${ITEM.label} — THORN FIT`,
  robots: { index: false, follow: false },
  alternates: { canonical: ITEM.href },
};

export const dynamic = 'force-dynamic';

export default async function InnstillingerRoute() {
  const user = await getSessionUser();
  if (!user) {
    redirect(`/konto/logg-inn?returnUrl=${encodeURIComponent(ITEM.href)}`);
  }

  return (
    <AccountShell user={user} activeId="settings">
      <SettingsView />
    </AccountShell>
  );
}
