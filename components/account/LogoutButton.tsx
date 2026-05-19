/**
 * LogoutButton — klient-island for "Logg ut"-raden i Profile-area.
 *
 * To layout-modi:
 *   - sidebar (Paper 6B7-0 6EA-0): plain gray rad, ingen chevron, ingen
 *     rounded bg. Border-top på kontaineren håndteres av `AccountSidebar`,
 *     ikke her — vi rendrer kun selve klikkbare flaten.
 *   - hub (Paper 7SO-0): rød rad med danger-variant og INGEN chevron.
 *     Bruker AccountNavRow med variant="danger" + asButton.
 *
 * POSTer til `/api/auth/logout` som kaller `wooLogout()` mot chef-auth-pluginen
 * og kjører `clearAllAuthCookies()` på server-siden. Etter success redirecter vi
 * klient-side til `/konto/logg-inn`. Selv om Woo-callet feiler tømmer route-
 * handleren cookies lokalt, så vi navigerer videre uavhengig.
 *
 * State: enkel useState for pending. Vi viser ikke en spinner — på success
 * navigerer vi vekk umiddelbart, og på error bytter vi til `LOGOUT_PENDING_LABEL`
 * frem til navigasjonen skjer.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  LOGOUT_LABEL,
  LOGOUT_PENDING_LABEL,
} from '@/lib/account/info';
import { cn } from '@/lib/utils/cn';
import { AccountIcon } from './AccountIcon';
import { AccountNavRow } from './AccountNavRow';

interface LogoutButtonProps {
  readonly layout?: 'sidebar' | 'hub';
}

export function LogoutButton({ layout = 'sidebar' }: LogoutButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    if (pending) return;
    setPending(true);

    try {
      const res = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      // Selv om logout feilet på WP-siden tømmer route-handleren cookies
      // lokalt — så vi navigerer videre uavhengig av status.
      void res;
    } catch (err) {
      // Ikke skriv stack-trace i UI — logg til console for utvikler.
      console.warn('logout request failed (clearing locally)', err);
    }

    // Hard refresh så RSC-en under leser ny (tom) cookie-jar.
    router.replace('/konto/logg-inn');
    router.refresh();
  }

  const label = pending ? LOGOUT_PENDING_LABEL : LOGOUT_LABEL;

  // Hub-mobile bruker den vanlige nav-row med danger-variant.
  if (layout === 'hub') {
    return (
      <AccountNavRow
        asButton
        onClick={handleLogout}
        disabled={pending}
        href="#"
        label={label}
        icon="logout"
        variant="danger"
        layout="hub"
      />
    );
  }

  // Sidebar (desktop) — egen plain-gray-rad: ingen chevron, ingen rounded bg,
  // tekst i muted ink. Hover gir bare en hint (text-ink) for å markere
  // klikkbarhet uten å introdusere ny visuell støy.
  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      aria-label={LOGOUT_LABEL}
      className={cn(
        'group flex w-full items-center gap-sp-2 px-sp-3 py-2.75 text-left',
        'text-body-sm text-ink-muted transition-colors hover:text-ink',
        pending && 'cursor-not-allowed opacity-60',
      )}
    >
      <span
        className="flex shrink-0 items-center justify-center text-ink-muted group-hover:text-ink"
        aria-hidden
      >
        <AccountIcon id="logout" size={16} />
      </span>
      <span>{label}</span>
    </button>
  );
}
