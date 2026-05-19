/**
 * /konto/registrer — Paper ADX-1.
 *
 * RSC shell + `RegisterForm` klient-island. Formen POSTer til
 * `/api/auth/register` som oppretter kunden i WooCommerce og gjør en
 * auto-login slik at brukeren lander rett på /konto.
 *
 * Layout-komponenten `AuthShell` er ren layout (2-kol desktop / stack
 * mobil). Tab-strip + header bor inne i `RegisterForm` sin
 * `AuthFormCard`-wrapper.
 */

import type { Metadata } from 'next';

import { AuthShell } from '@/components/account/AuthShell';
import { RegisterForm } from '@/components/account/RegisterForm';
import { REGISTER_SUBTITLE, REGISTER_TITLE } from '@/lib/auth/info';

export const metadata: Metadata = {
  title: `${REGISTER_TITLE} — Skarpe Kniver`,
  description: REGISTER_SUBTITLE,
  robots: { index: false, follow: false },
  alternates: {
    canonical: '/konto/registrer',
  },
};

export default function RegisterRoute() {
  return (
    <AuthShell>
      <RegisterForm />
    </AuthShell>
  );
}
