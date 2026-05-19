/**
 * FooterShell — client-wrapper som leser pathname og skjuler footeren på
 * mobil-checkout.
 *
 * Bakgrunn: Paper 5Y7-0 (Checkout Mobile) viser ingen footer — sticky
 * checkout-baren er det siste som er synlig på siden. På desktop vises
 * fortsatt footer normalt.
 *
 * NB: Tar `<Footer />` inn som `children` framfor å importere det direkte.
 * Server-Footer importerer `lib/supabase/server.ts` som har 'server-only',
 * så et direkte import fra denne client-komponenten ville bryte server/
 * client-grensa. Children-prop-mønsteret lar Footer (server) renderes inni
 * client-wrappers uten å krysse grensa.
 *
 * Ruter som skjuler footer på mobil:
 *   - /checkout (selve kjøps-flyten)
 *
 * Desktop (md+) viser footer på alle ruter som vanlig.
 */

'use client';

import { usePathname } from 'next/navigation';

interface FooterShellProps {
  children: React.ReactNode;
}

export function FooterShell({ children }: FooterShellProps) {
  const pathname = usePathname();
  const hideOnMobile = pathname?.startsWith('/checkout') ?? false;

  return (
    <div className={hideOnMobile ? 'hidden md:block' : undefined}>
      {children}
    </div>
  );
}
