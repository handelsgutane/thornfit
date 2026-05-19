/**
 * AuthShell — delt page-frame for /konto/logg-inn og /konto/registrer
 * (Paper ALR-1 / ADX-1 / AQT-1).
 *
 * AuthShell er nå en ren layout-komponent. Alt UI (tab-strip, header, form-
 * felter) bor i `AuthFormCard` + `LoginForm`/`RegisterForm`, som er klient-
 * islands. AuthShell sørger kun for:
 *
 *   - Desktop (≥lg): 2-kolonne grid `[1fr | 520px]`. Venstre kolonne er
 *     form-kolonnen — innhold sentrert med generøs top-padding og
 *     side-padding som matcher Paper. Høyre kolonne er `AuthBenefits`
 *     (brand-fixed dark panel, alltid synlig på desktop).
 *   - Mobile: ett-kolonne stack. Form-kortet kommer først, `AuthBenefits`
 *     rendres under som komprimert variant (Paper AQT-1 viser de 4 første
 *     fordelene på mobil).
 *
 * AuthShell er en RSC — children er klient-form-komponentene som håndterer
 * interaksjonen. Dette lar benefits-panelet streame uten hydrering og gir
 * raskere TTI på login-siden.
 */
import type { ReactNode } from 'react';

import { AuthBenefits } from './AuthBenefits';

interface AuthShellProps {
  readonly children: ReactNode;
}

export function AuthShell({ children }: AuthShellProps) {
  return (
    <div className="grid min-h-(--min-h-auth-shell) bg-canvas lg:grid-cols-[1fr_var(--width-auth-benefits)]">
      {/* Form-kolonnen: AuthFormCard-et børstes av klient-islanden.
          Padding styres her så kortet selv sitter flush mot Paper-rutene.
          Max-width på wrapper-diven holder kortet sentrert selv på 2560px-
          skjermer. */}
      <section className="flex min-h-(--min-h-auth-shell) flex-col items-center justify-start px-sp-3 pt-sp-5 pb-sp-7 md:px-sp-7 md:pt-sp-7 lg:pt-sp-8">
        <div className="flex w-full max-w-(--width-auth-card-login) flex-col">
          {children}
        </div>
      </section>

      <AuthBenefits />
    </div>
  );
}
