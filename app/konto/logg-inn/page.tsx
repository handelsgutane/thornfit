/**
 * /konto/logg-inn — Paper ALR-1 + AQT-1.
 *
 * RSC shell + `LoginForm` klient-island. RSC leser ingen session-data
 * (det er valgfritt senere — vi kan redirecte allerede-innloggede til
 * /konto med `redirect(returnUrl)` basert på `getSessionUser()`).
 *
 * Layout-komponenten `AuthShell` er ren layout (2-kol desktop / stack
 * mobil). Tab-strip, header og form-felter bor inne i `LoginForm` sin
 * `AuthFormCard`-wrapper — derfor trenger denne siden ikke å sende
 * activeTab/title/subtitle lenger.
 *
 * SEO: ikke indekseres. `robots: { index: false }` — det er en privat
 * flate og duplikat med /konto/registrer gir ingen søkeverdi.
 */

import type { Metadata } from 'next';
import { Suspense } from 'react';

import { AuthShell } from '@/components/account/AuthShell';
import { LoginForm, LoginFormSkeleton } from '@/components/account/LoginForm';
import { LOGIN_SUBTITLE, LOGIN_TITLE } from '@/lib/auth/info';

export const metadata: Metadata = {
  title: `${LOGIN_TITLE} — Skarpe Kniver`,
  description: LOGIN_SUBTITLE,
  robots: { index: false, follow: false },
  alternates: {
    canonical: '/konto/logg-inn',
  },
};

export default function LoginRoute() {
  return (
    <AuthShell>
      {/* `LoginForm` bruker `useSearchParams()` for returnUrl — Next.js 16
          krever at komponenten er pakket i Suspense for å kunne
          prerenderes statisk. Skeletonen matcher form-kort-dimensjonene
          så det ikke blir layout-shift før hydrering. */}
      <Suspense fallback={<LoginFormSkeleton />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
