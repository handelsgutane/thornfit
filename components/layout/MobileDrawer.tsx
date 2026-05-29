'use client';

/**
 * MobileDrawer — slide-in-meny for mobilklienter. Paper-ref `G2-0` / `GS-0`.
 *
 * Client-komponent (owns open/close + accordion state). Utløses av hamburger-
 * knappen i `HeaderMobile` via `useMobileDrawer()`-hooken. Context i stedet
 * for portal gjør at drawer-en kan leve i body-rot mens knappen er i headeren.
 *
 * Struktur (Paper G2-0):
 *   1. Header-bar       — `h-mobile-header`, tittel + lukk-knapp
 *   2. Søke-seksjon     — `GU-0` (41px bokshøyde, surface-muted bg)
 *   3. Nav-liste        — `h-drawer-row` per rad (52px), radio-accordion
 *   4. Footer           — `bg-surface-muted`, aka CTA + muted sekundær-lenker
 *
 * Bakgrunn: drawer-body er `bg-surface` (themed). Footeren og search-boksen
 * bruker `bg-surface-muted` for subtil differensiering. Overlay-en er
 * `bg-kuro/50` (brand-fixed — skal være mørk uansett mode). Se ADR-0008.
 *
 * Accordion: én gruppe åpen om gangen. Hver rad er en `<button aria-expanded>`.
 * Innholdet er en lenke-liste som navigerer bort og lukker drawer-en via
 * `usePathname`-effekten.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { Logo } from '@/components/brand/Logo';
import { CartBadge } from '@/components/cart/CartBadge';
import { SearchOverlayTrigger } from '@/components/search/SearchOverlayProvider';
import type { NavItem, NavLinkGroup, NavOverviewColumn } from '@/lib/nav/schema';

import { IconChevronDown, IconChevronRight, IconClose, IconSearch } from './icons';

// ----- Context / hook ------------------------------------------------------

type DrawerCtx = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const Ctx = createContext<DrawerCtx | null>(null);

export function MobileDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMobileDrawer(): DrawerCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error('useMobileDrawer must be used inside <MobileDrawerProvider>');
  }
  return ctx;
}

// ----- Drawer --------------------------------------------------------------

type MobileDrawerProps = {
  items: ReadonlyArray<NavItem>;
};

export function MobileDrawer({ items }: MobileDrawerProps) {
  const { open, setOpen } = useMobileDrawer();
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<number | null>(null);

  // Lukk ved ruteendring — "adjusting state based on a prop" pattern.
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    if (open) setOpen(false);
    if (expanded !== null) setExpanded(null);
  }

  // Lås body-scroll når drawer er åpen
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ESC lukker
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  return (
    <>
      {/* Overlay */}
      <div
        aria-hidden={!open}
        onClick={() => setOpen(false)}
        className={[
          'fixed inset-0 z-40 bg-kuro/50 transition-opacity duration-200',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Meny"
        aria-hidden={!open}
        className={[
          'fixed inset-y-0 left-0 z-50 flex w-[min(var(--width-drawer),90vw)] flex-col bg-surface shadow-sm',
          'transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <header className="flex h-mobile-header items-center justify-between border-b border-divider px-sp-4">
          {/*
           * Drawer-header brukte tidligere en font-serif tekst-wordmark som
           * placeholder. Bytt til faktisk Logo-komponent (samme asset som
           * HeaderMobile/HeaderDesktop) så brand-uttrykket er konsistent på
           * tvers av entry-points. Lukker drawer ved klikk — fungerer som
           * "tilbake til forsiden"-snarvei.
           */}
          <Link
            href="/"
            onClick={() => setOpen(false)}
            aria-label="ThornFit — forside"
            className="flex items-center text-ink"
          >
            {/* Stacked-logo — match HeaderMobile (h-9) for konsistens. */}
            <Logo variant="mobile" className="h-9 w-auto" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Lukk meny"
            className="flex h-10 w-10 items-center justify-center text-ink"
          >
            <IconClose size={20} />
          </button>
        </header>

        <div className="border-b border-divider px-sp-4 py-sp-3">
          {/*
           * Søkefelt — åpner SearchOverlay (mobile-variant) og lukker drawer.
           * Renders som et button-stylet search-felt for å matche Paper GU-0,
           * men adferden er identisk med søke-ikonet i HeaderMobile.
           */}
          <SearchOverlayTrigger
            ariaLabel="Søk etter produkter"
            onClick={() => setOpen(false)}
            className="flex h-11 w-full items-center gap-sp-2 rounded-1 border border-divider bg-surface-muted px-sp-3 text-body-sm text-ink-muted" /* paper-exact: GU-0 (41px height rounded to h-11) */
          >
            <IconSearch size={16} />
            <span>Søk etter produkter …</span>
          </SearchOverlayTrigger>
        </div>

        <nav aria-label="Meny" className="flex-1 overflow-y-auto">
          <ul className="flex flex-col">
            {items.map((item, idx) => {
              const hasMega = Boolean(
                item.mega &&
                  (item.mega.overview ||
                    item.mega.groups.length > 0 ||
                    item.mega.editorial),
              );
              const isOpen = expanded === idx;
              return (
                <li key={item.href} className="border-b border-divider">
                  {hasMega ? (
                    <>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setExpanded(isOpen ? null : idx)}
                        className="flex h-drawer-row w-full items-center justify-between px-sp-4 text-body-md font-bold text-ink"
                      >
                        <span className={item.accent ? 'text-aka' : ''}>{item.label}</span>
                        <IconChevronDown
                          size={16}
                          className={[
                            'text-ink-muted transition-transform duration-150',
                            isOpen ? 'rotate-180' : '',
                          ].join(' ')}
                        />
                      </button>
                      {isOpen && item.mega && (
                        <div className="bg-surface-muted pb-sp-2">
                          <DrawerMegaContent mega={item.mega} />
                        </div>
                      )}
                    </>
                  ) : (
                    <Link
                      href={item.href}
                      className={[
                        'flex h-drawer-row items-center justify-between px-sp-4 text-body-md font-bold',
                        item.accent ? 'text-aka' : 'text-ink',
                      ].join(' ')}
                    >
                      <span>{item.label}</span>
                      <IconChevronRight size={14} className="text-ink-muted" />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        <footer className="border-t border-divider bg-surface-muted p-sp-4">
          <Link
            href="/handlekurv"
            className="flex h-11 w-full items-center justify-center rounded-1 bg-aka text-body-sm font-bold tracking-[0.02em] text-shiro hover:bg-aka-dark" /* paper-exact: GY-0 — aka/shiro brand-fixed */
          >
            Se din kurv
            <CartBadge variant="text" className="text-shiro" />
          </Link>
          <div className="mt-sp-3 flex items-center justify-center gap-sp-2 text-muted-sm font-medium text-ink-muted">
            <Link href="/konto" className="hover:text-ink">Min konto</Link>
            <span aria-hidden className="text-divider">|</span>
            <Link href="/knivsliping" className="hover:text-ink">Knivsliping</Link>
            <span aria-hidden className="text-divider">|</span>
            <Link href="/hjelp" className="hover:text-ink">Hjelp</Link>
          </div>
        </footer>
      </aside>
    </>
  );
}

// ----- Drawer expanded content --------------------------------------------

function DrawerMegaContent({
  mega,
}: {
  mega: { overview?: NavOverviewColumn; groups: ReadonlyArray<NavLinkGroup> };
}) {
  return (
    <div>
      {mega.overview && (
        <Section title={mega.overview.title}>
          <DrawerLinkRow
            href={mega.overview.lead.href}
            label={mega.overview.lead.title}
            bold
          />
          {mega.overview.links.map((link) => (
            <DrawerLinkRow key={link.href} href={link.href} label={link.label} />
          ))}
        </Section>
      )}

      {mega.groups.map((group) => (
        <Section key={group.title} title={group.title}>
          {group.links.map((link) => (
            <DrawerLinkRow key={link.href} href={link.href} label={link.label} />
          ))}
          {group.seeAll && (
            <Link
              href={group.seeAll.href}
              className="block px-sp-4 py-sp-2 text-muted-sm font-bold tracking-[0.02em] text-aka hover:text-aka-dark" /* paper-exact: G8-0 */
            >
              {group.seeAll.label}
            </Link>
          )}
        </Section>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="px-sp-4 pt-sp-3 pb-sp-1 text-label-sm font-bold uppercase text-ink-subtle">
        {title}
      </h3>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

function DrawerLinkRow({
  href,
  label,
  bold,
}: {
  href: string;
  label: string;
  bold?: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        className={[
          'flex items-center justify-between px-sp-4 py-sp-2 text-body-sm text-ink',
          bold ? 'font-bold' : 'font-medium',
        ].join(' ')}
      >
        <span>{label}</span>
        <IconChevronRight size={14} className="text-ink-muted" />
      </Link>
    </li>
  );
}
