/**
 * AccountShell — felles layout for sub-sider i Profile-area (`/konto/ordrer`,
 * `/konto/onskeliste`, `/konto/adresser`, …).
 *
 * Desktop (≥lg) — Paper 6B7-0 layout (`main-layout` 6CQ-0):
 *   ┌──── full viewport (px-sp-7 = 64px) ────────────────────────────┐
 *   │  ┌── sidebar 260 ──┐  ┌────── content (grow) ────────────────┐ │
 *   │  │  Profile        │  │  Page-header + actions               │ │
 *   │  │  Nav            │  │  Body                                │ │
 *   │  │  Logout         │  │                                      │ │
 *   │  └─────────────────┘  └──────────────────────────────────────┘ │
 *   └────────────────────────────────────────────────────────────────┘
 *      ↑                  ↑
 *      sidebar starter    48px gap mellom sidebar og content
 *      ved venstre kant
 *
 * Top-padding: py-sp-7 (64px) for å matche page-margin under utility-bar.
 *
 * NB: Vi bruker IKKE `max-w-(--width-content)` her. Header-baren spenner full
 * viewport med `px-sp-7` som side-margin (se HeaderDesktop.tsx + CartPage.tsx),
 * så for å matche header-bredden må konto-shell gjøre det samme. Tidligere
 * ble shellen låst til 1312px sentrert og skapte synlig "klemt"-layout på
 * wide-monitorer der headeren strakk seg lenger enn innholdet.
 *
 * Mobile (<lg):
 *   Ingen sidebar — content tar full bredde med px-sp-4 py-sp-5. Sub-siden
 *   er ansvarlig for sitt eget mobile-header (back-knapp + tittel) hvis
 *   relevant. Konto-roten (`/konto`) bruker `AccountMobileHub` i stedet for
 *   AccountShell.
 *
 * Auth-gate: caller (route-page) gjør redirect før denne rendres. Vi tar
 * `user` som prop slik at sidebar kan vise navn/e-post uten å re-fetche.
 */

import type { ReactNode } from 'react';

import type { AuthUser } from '@/lib/auth/session';
import type { AccountNavItem } from '@/lib/account/info';

import { AccountSidebar } from './AccountSidebar';

interface AccountShellProps {
  readonly user: AuthUser | null;
  readonly activeId: AccountNavItem['id'];
  readonly children: ReactNode;
}

export function AccountShell({ user, activeId, children }: AccountShellProps) {
  return (
    <div className="bg-canvas">
      <div
        className={
          // Mobile: enkel kolonne, padding fra side til side.
          // Desktop: full viewport (matcher header), 48px gap mellom sidebar og content.
          'flex min-h-(--min-h-auth-shell) flex-col px-sp-3 py-sp-5 md:px-sp-7 ' +
          'lg:flex-row lg:gap-(--gap-account-shell) lg:py-sp-7'
        }
      >
        <AccountSidebar user={user} activeId={activeId} />
        <main className="flex w-full min-w-0 flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
