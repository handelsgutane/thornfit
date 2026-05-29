/**
 * /checkout — kjøps-flow (Paper 5MI-0 desktop / 5Y7-0 mobile).
 *
 * Server-shell. All state og interaksjon lever i `<CheckoutClient>`-komponenten.
 * Dynamic rendering — siden må ikke caches ettersom den leser cart fra
 * localStorage (klient-side) og auth fra cookies på request-tid.
 *
 * Auth + prefill:
 *   - `getSessionUser()` gir oss `{ id, email, displayName, roles }` fra
 *     `skn_user`-cookien.
 *   - Når innlogget: `wooFetchCustomerAddresses(id)` henter billing- og
 *     shipping-adresser fra WC. Vi sender inn billing som `prefill` til
 *     CheckoutClient slik at e-post, telefon og leveringsadresse kommer
 *     forhåndsutfylt.
 *   - Hvis Woo-kallet feiler (timeout / 5xx): vi swallow'er feilen og lar
 *     formen være tom. Brukeren kan fortsatt fullføre kjøpet manuelt.
 */

import type { Metadata } from 'next';

import { CheckoutClient, type CheckoutPrefill } from '@/components/checkout/CheckoutClient';
import { getSessionUser } from '@/lib/auth/session';
import { wooFetchCustomerAddresses } from '@/lib/woo/customers';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Checkout — THORN FIT',
  description: 'Fullfør kjøpet ditt.',
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  const session = await getSessionUser();
  const isAuthenticated = session !== null;

  let prefill: CheckoutPrefill | undefined;
  if (session) {
    try {
      const addresses = await wooFetchCustomerAddresses(session.id);
      const b = addresses.billing;
      prefill = {
        contact: {
          email: b.email || session.email,
          phone: b.phone,
        },
        address: {
          country:    b.country || 'NO',
          company:    b.company,
          firstName:  b.firstName,
          lastName:   b.lastName,
          street:     b.addressLine1,
          street2:    b.addressLine2,
          postalCode: b.postcode,
          city:       b.city,
          phone:      b.phone,
        },
      };
    } catch {
      // Swallow — la skjemaet være tomt så bruker kan fortsette manuelt.
      // Logging skjer inne i wooFetchCustomerAddresses ved fail.
    }
  }

  return (
    <CheckoutClient isAuthenticated={isAuthenticated} prefill={prefill} />
  );
}
