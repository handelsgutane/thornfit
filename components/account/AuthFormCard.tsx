'use client';

/**
 * AuthFormCard — felles kort-wrapper for `LoginForm` og `RegisterForm`
 * (Paper ALR-1 / ADX-1 / AQT-1 "form-card").
 *
 * Strukturen inni Paper-kortet (top → bottom):
 *   1. Tab-strip (Logg inn / Registrer deg) — kun tekst-bredde, felles
 *      divider-linje på tvers av kortet med aktiv-tabs 2px aka-underline
 *      overlappende.
 *   2. Header — H2 ("Velkommen tilbake" / "Opprett konto") + subtitle med
 *      en inline-lenke til den andre siden ("Registrer deg her" / "Logg
 *      inn her").
 *   3. `children` — selve form-felter.
 *
 * Kortet selv:
 *   - `bg-surface` (flipper med tema; Paper bruker shiro = hvit)
 *   - `border border-divider` (sakai #E0E0DC i light, #333 i dark)
 *   - `rounded-2` (4px — r-2-token)
 *   - `shadow` via --shadow-auth-card (desktop) / --shadow-auth-card-sm (mobil)
 *   - Padding: 28/24 mobil, 48/44 desktop
 *   - Max-width: 776px (login) eller 560px (register), ulik fordi register
 *     har flere felter og trenger kortere line-length.
 *
 * Komponenten er `'use client'` fordi den brukes inne i klient-form-
 * komponenter som driver state + submit. Den har selv ingen state.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';

import { AUTH_TABS, type AuthTab } from '@/lib/auth/info';

type AuthCardVariant = 'login' | 'register';

interface AuthFormCardProps {
  readonly activeTab: AuthTab;
  readonly variant: AuthCardVariant;
  readonly title: string;
  readonly subPrefix: string;
  readonly subLinkLabel: string;
  readonly subLinkHref: string;
  readonly children: ReactNode;
}

export function AuthFormCard({
  activeTab,
  variant,
  title,
  subPrefix,
  subLinkLabel,
  subLinkHref,
  children,
}: AuthFormCardProps) {
  // Tailwind v4: custom-property referanser må være i arbitrary-verdi-form.
  // Her er vi bevisst om det — disse to tokens finnes i globals.css (de er ikke
  // klasser i Tailwind-default). `max-w-[var(--...)]` er godkjent mønster i
  // docs/conventions.md for nettopp token-referanse.
  const maxWidthClass =
    variant === 'login'
      ? 'lg:max-w-[var(--width-auth-card-login)]'
      : 'lg:max-w-[var(--width-auth-card-register)]';

  return (
    <div
      className={[
        'w-full',
        maxWidthClass,
        'rounded-2 border border-divider bg-surface',
        // Shadow varierer mobile ↔ desktop. På mobil ville den fulle
        // 16px-shadowen sett for tung ut på et smalere kort.
        'shadow-[var(--shadow-auth-card-sm)] lg:shadow-[var(--shadow-auth-card)]',
        // Padding responsive.
        'px-[var(--padding-auth-card-x-sm)] py-[var(--padding-auth-card-y-sm)]',
        'lg:px-[var(--padding-auth-card-x)] lg:py-[var(--padding-auth-card-y)]',
      ].join(' ')}
    >
      <AuthTabs activeTab={activeTab} />

      <header className="mt-sp-5 mb-sp-5 flex flex-col gap-sp-2 lg:mt-sp-6 lg:mb-sp-6">
        <h1 className="text-h2 font-bold text-ink lg:text-h1">{title}</h1>
        <p className="text-body-sm text-ink-muted lg:text-body">
          {subPrefix}{' '}
          <Link
            href={subLinkHref}
            className="text-ink underline underline-offset-4 hover:text-aka focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2"
          >
            {subLinkLabel}
          </Link>
        </p>
      </header>

      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AuthTabs — Paper-tro: hver tab bare tekst-bredde, felles divider under,
// aktiv tab har 2px aka-border som overlapper divideren (via -mb-px).
// ---------------------------------------------------------------------------

function AuthTabs({ activeTab }: { activeTab: AuthTab }) {
  return (
    <nav
      aria-label="Kontofaner"
      role="tablist"
      className="flex gap-sp-5 border-b border-divider"
    >
      {AUTH_TABS.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            role="tab"
            aria-selected={isActive}
            // -mb-px trekker aka-underline ned over divideren så det blir
            // én visuell linje med fylt-aktiv-segment.
            className={[
              'relative -mb-px pb-sp-2 text-body-md font-bold transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2',
              isActive
                ? 'border-b-2 border-aka text-ink'
                : 'text-ink-muted hover:text-ink',
            ].join(' ')}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
