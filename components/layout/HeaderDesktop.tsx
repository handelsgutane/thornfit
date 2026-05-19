/**
 * HeaderDesktop — logo + primary nav + actions. Matcher Paper `9W-0`.
 *
 * Server-komponent. Mottar `items` fra `Header.tsx`. Den interaktive delen
 * (mega-menu-åpning, hover-state) ligger i `PrimaryNav.tsx`.
 *
 * Synlighet: `hidden md:flex` — rendres i DOM også på mobil (CSS skjuler).
 * Det er en bevisst forenkling: alternativet (server-side user-agent sniff
 * eller client-side viewport-check) gir layout-shift og ekstra kompleksitet.
 *
 * Key tokens brukt (semantiske — flipper med light/dark, se ADR-0008):
 *   - `h-header` (72px)              — `--height-header`
 *   - `bg-surface`                   — surface (shiro light / sumi-deep dark)
 *   - `border-b border-divider`      — divider (sakai light / sumi-raised dark)
 *   - `px-sp-7`                      — `--spacing-sp-7` (64px)
 *   - `gap-sp-6`                     — `--spacing-sp-6` (48px)
 *   - `text-body-sm`                 — 14/18, primary nav
 *
 * Kurv-knappen var tidligere en dark pill med "Kurv"-label; endret 2026-04-24
 * til ren icon-only knapp med floating count-badge (se `HeaderCartLink`).
 */

import Link from 'next/link';

import { Logo } from '@/components/brand/Logo';
import { HeaderCartLink } from '@/components/cart/HeaderCartLink';
import { SearchOverlayTrigger } from '@/components/search/SearchOverlayProvider';
import type { NavItem } from '@/lib/nav/schema';

import { IconCart, IconSearch, IconUser } from './icons';
import { PrimaryNav } from './PrimaryNav';
import { ThemeToggle } from './ThemeToggle';

type HeaderDesktopProps = {
  items: ReadonlyArray<NavItem>;
};

export function HeaderDesktop({ items }: HeaderDesktopProps) {
  // `relative` gjør at MegaMenu (som bruker `absolute left-0 right-0 top-full`)
  // anker seg til hele header-baren i stedet for et enkelt <li> i PrimaryNav.
  // `isolate` lager en egen stacking-context — sikrer at `z-50` på mega-panelet
  // ikke kolliderer med page-content som har egen z-stacking.
  //
  // Merk: Inner-baren har BEVISST ingen `max-w-(--width-content)`-grense.
  // Tidligere stod `max-w-[--width-content]` her, men Tailwind v4 emitterer
  // den bokstavlig (invalid CSS) så konstrainten var en no-op. Da vi fikset
  // syntaxen til `max-w-(--width-content)` ble baren plutselig låst til
  // 1312px sentrert, som klemmer nav-items på wide-monitor og så "kaotisk" ut.
  // Header-baren skal spenne full viewport og bruke `px-sp-7` som side-
  // margin — det matcher hva designet har sett ut som hele utviklingen.
  return (
    <div className="relative isolate hidden border-b border-divider bg-surface md:block">
      <div className="flex h-header items-stretch gap-sp-6 px-sp-7">
        <div className="flex items-center">
          <Link
            href="/"
            aria-label="Skarpekniver — forside"
            className="flex items-center text-ink"
          >
            <Logo variant="desktop" className="h-9 w-auto" />
          </Link>
        </div>

        <nav aria-label="Primær-navigasjon" className="flex flex-1 items-stretch">
          <PrimaryNav items={items} />
        </nav>

        <div className="flex items-center gap-sp-2">
          <SearchOverlayTrigger
            ariaLabel="Søk"
            className="flex h-10 w-10 items-center justify-center text-ink hover:bg-surface-hover"
          >
            <IconSearch size={18} />
          </SearchOverlayTrigger>
          <Link
            href="/konto"
            aria-label="Min konto"
            className="flex h-10 w-10 items-center justify-center text-ink hover:bg-surface-hover"
          >
            <IconUser size={18} />
          </Link>
          <ThemeToggle />
          <HeaderCartLink variant="desktop">
            <IconCart size={18} />
          </HeaderCartLink>
        </div>
      </div>
    </div>
  );
}
