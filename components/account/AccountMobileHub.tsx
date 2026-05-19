/**
 * AccountMobileHub — mobile landing for `/konto` (Paper 7SO-0).
 *
 * Layout (390×593):
 *   ┌─────────────────────┐
 *   │ Profil-blokk 169px  │  64×64 avatar sentrert + navn + e-post
 *   ├─────────────────────┤
 *   │ Mine ordrer     ›   │  7 nav-rader à 51px. Hub bruker hele
 *   │ Ønskeliste      ›   │  bredden (390px) med 16px side-padding
 *   │ Personlig info  ›   │  fra wrapper, ikke per-rad. Bottom-divider
 *   │ Adresser        ›   │  per rad.
 *   │ Betaling        ›   │
 *   │ Innstillinger   ›   │
 *   │ Logg ut             │  Rød, 50px, ingen chevron.
 *   └─────────────────────┘
 *
 * Synlighet: `lg:hidden` — på desktop bruker vi sidebar + content-kolonne
 * via `AccountShell`. På mobil rendres ingen sidebar; hub-en er hele
 * konto-siden.
 */

import {
  ACCOUNT_NAV,
  PROFILE_FALLBACK_NAME,
} from '@/lib/account/info';
import type { AuthUser } from '@/lib/auth/session';
import { AccountNavRow } from './AccountNavRow';
import { LogoutButton } from './LogoutButton';

interface AccountMobileHubProps {
  readonly user: AuthUser | null;
}

export function AccountMobileHub({ user }: AccountMobileHubProps) {
  return (
    <div className="flex w-full flex-col bg-surface lg:hidden">
      {/* Profil-blokk — sentrert, generøs padding */}
      <div className="flex flex-col items-center gap-sp-3 px-sp-4 py-sp-6">
        <MobileAvatar name={user?.displayName ?? PROFILE_FALLBACK_NAME} />
        <div className="flex flex-col items-center gap-sp-1">
          <span className="text-body-md font-bold text-ink">
            {user?.displayName ?? PROFILE_FALLBACK_NAME}
          </span>
          {user?.email && (
            <span className="text-body-sm text-ink-muted">{user.email}</span>
          )}
        </div>
      </div>

      {/* Nav-liste — full-width, bottom-divider per rad. Top-border for å
          mate inn i profile-blokken visuelt. */}
      <nav
        aria-label="Konto-meny"
        className="flex flex-col border-t border-divider"
      >
        {ACCOUNT_NAV.map((item) => (
          <AccountNavRow
            key={item.id}
            href={item.href}
            label={item.label}
            icon={item.icon}
            layout="hub"
          />
        ))}

        {/* Logg ut — egen klient-island, samme hub-layout men rød */}
        <LogoutButton layout="hub" />
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MobileAvatar({ name }: { name: string }) {
  const initials = getInitials(name);
  return (
    <div
      aria-hidden
      className="flex size-(--size-account-avatar-mobile) items-center justify-center rounded-full bg-ink text-h3 font-bold text-ink-inverse"
    >
      {initials}
    </div>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase().slice(0, 2);
}
