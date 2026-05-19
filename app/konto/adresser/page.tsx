import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AccountShell } from '@/components/account/AccountShell';
import { AddressesView } from '@/components/account/AddressesView';
import { ACCOUNT_NAV } from '@/lib/account/info';
import { getSessionUser } from '@/lib/auth/session';
import { wooFetchCustomerAddresses } from '@/lib/woo/customers';

const ITEM = ACCOUNT_NAV.find((i) => i.id === 'addresses')!;

export const metadata: Metadata = {
  title: `${ITEM.label} — Skarpe Kniver`,
  robots: { index: false, follow: false },
  alternates: { canonical: ITEM.href },
};

export const dynamic = 'force-dynamic';

export default async function AdresserRoute() {
  const user = await getSessionUser();
  if (!user) {
    redirect(`/konto/logg-inn?returnUrl=${encodeURIComponent(ITEM.href)}`);
  }

  const { billing, shipping } = await wooFetchCustomerAddresses(user.id);

  return (
    <AccountShell user={user} activeId="addresses">
      <AddressesView billing={billing} shipping={shipping} />
    </AccountShell>
  );
}
