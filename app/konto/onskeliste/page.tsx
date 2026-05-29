import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AccountShell } from '@/components/account/AccountShell';
import { WishlistView } from '@/components/account/WishlistView';
import { ACCOUNT_NAV } from '@/lib/account/info';
import { getSessionUser } from '@/lib/auth/session';

const ITEM = ACCOUNT_NAV.find((i) => i.id === 'wishlist')!;

export const metadata: Metadata = {
  title: `${ITEM.label} — THORN FIT`,
  robots: { index: false, follow: false },
  alternates: { canonical: ITEM.href },
};

export const dynamic = 'force-dynamic';

export default async function OnskelisteRoute() {
  const user = await getSessionUser();
  if (!user) {
    redirect(`/konto/logg-inn?returnUrl=${encodeURIComponent(ITEM.href)}`);
  }

  return (
    <AccountShell user={user} activeId="wishlist">
      <WishlistView />
    </AccountShell>
  );
}
