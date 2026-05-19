/**
 * AccountSidebar — persistent venstre-sidebar i Profile-area (Paper 6B7-0).
 *
 * Layout (260px bred, no horizontal padding — innholdet starter ved venstre
 * kant av kolonnen):
 *   ┌─────────────────────┐
 *   │  ●  EH               │  56×56 avatar sirkel (kuro bg, hvit initial)
 *   │  Esben Holmboe Bang  │  Navn: 16px/20px bold
 *   │  chef@restaurant.no  │  E-post: 13px/16px muted
 *   │ ─────────────────── ─│  Bottom-divider (E0E0DC) under hele profil-cardet
 *   │  ▣  Mine ordrer    > │  Active rad: bg-ink, hvit tekst + chevron
 *   │  ♡  Ønskeliste     > │  Inactive: muted ink (#6B6B65) + chevron
 *   │  ◉  Personlig info > │
 *   │  ⌖  Adresser       > │
 *   │  ▭  Betalings…     > │
 *   │  ☼  Innstillinger  > │
 *   │ ─────────────────── ─│  Top-divider (E0E0DC) over Logg ut
 *   │  ↩  Logg ut          │  Plain muted, NO chevron, IKKE rød på desktop
 *   └─────────────────────┘
 *
 * Synlighet: `hidden lg:flex` — på mobil bruker vi `AccountMobileHub` i stedet,
 * som er en egen RSC-komponent rendret kun på `<lg`.
 *
 * Spacing — verifisert mot Paper 6CR-0 / 6CS-0 / 6CY-0 / 6EA-0:
 *   - profile-card: pb-7 (28px), gap-3 (12px), items-start, border-b #E0E0DC
 *   - nav-list: pt-2 (8px), gap-0 (rader stables med mb-0.5 hver, men her bruker
 *     vi gap-0.5 på flex-container istedenfor mb)
 *   - logout-row: py-2.75 (11px) px-3 (12px), gap-2.5 (10px), border-t #E0E0DC,
 *     IKKE rød (Paper viser haiiro — på mobil-hub er den rød, ikke her).
 *
 * Auth: forventer at parent (`AccountShell` / route page) har gjort
 * `getSessionUser()`-sjekk. Defensiv mot `null` user via `PROFILE_FALLBACK_NAME`.
 */

import {
  ACCOUNT_NAV,
  PROFILE_FALLBACK_NAME,
  type AccountNavItem,
} from '@/lib/account/info';
import type { AuthUser } from '@/lib/auth/session';
import { AccountNavRow } from './AccountNavRow';
import { LogoutButton } from './LogoutButton';

interface AccountSidebarProps {
  readonly user: AuthUser | null;
  /** Slug for å avgjøre active state — `orders`, `wishlist`, etc. */
  readonly activeId?: AccountNavItem['id'];
}

export function AccountSidebar({ user, activeId }: AccountSidebarProps) {
  return (
    <aside
      aria-label="Konto-navigasjon"
      className="hidden w-(--width-account-sidebar) shrink-0 flex-col lg:flex"
    >
      {/* Profile-card — items-start, ingen horisontal padding */}
      <div className="flex flex-col items-start gap-sp-2 border-b border-divider pb-7">
        <Avatar name={user?.displayName ?? PROFILE_FALLBACK_NAME} />
        <div className="flex flex-col gap-px">
          <span className="text-body font-bold text-ink">
            {user?.displayName ?? PROFILE_FALLBACK_NAME}
          </span>
          {user?.email && (
            <span className="text-body-xs text-ink-muted">{user.email}</span>
          )}
        </div>
      </div>

      {/* Nav-liste — pt-2, mb-0.5 mellom rader (via gap-0.5) */}
      <nav
        aria-label="Konto-meny"
        className="flex flex-col gap-0.5 pt-sp-2"
      >
        {ACCOUNT_NAV.map((item) => (
          <AccountNavRow
            key={item.id}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={activeId === item.id}
            layout="sidebar"
          />
        ))}
      </nav>

      {/* Logg ut nederst — push-to-bottom + border-top divider */}
      <div className="mt-auto border-t border-divider">
        <LogoutButton layout="sidebar" />
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Avatar — initialer på solid bakgrunn (kuro). Brukes når brukeren ikke har
// uploaded foto. Når wp/profile-foto-feltet er klart kan vi bytte mot <Image>.
// Tekst: 20px/24px Satoshi bold (Paper 6CU-0).
// ---------------------------------------------------------------------------

function Avatar({ name }: { name: string }) {
  const initials = getInitials(name);
  return (
    <div
      aria-hidden
      className="flex size-(--size-account-avatar) shrink-0 items-center justify-center rounded-full bg-ink text-h3 font-bold tracking-tight text-ink-inverse"
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
