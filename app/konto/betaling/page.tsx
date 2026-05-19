/**
 * /konto/betaling — placeholder. Lagrede betalingsmetoder kommer etter
 * Vipps/Stripe-integrasjonen er produksjons-klar.
 */

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function BetalingRoute() {
  redirect('/konto');
}
