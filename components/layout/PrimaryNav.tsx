'use client';

/**
 * PrimaryNav — desktop-navigasjonens top-level rad + mega-menu-styring.
 *
 * Paper-ref: `A3-0` (nav-container) + `A4-0` (item, med aktiv `border-b-2 aka`).
 *
 * Client-komponent fordi den eier hover-, keyboard- og outside-click-state.
 * Mega-menu-innholdet rendres som server-markup (via `MegaMenu.tsx`).
 *
 * Hover-intent: 120ms close-delay. En rask mus-sveip fra én trigger til nabo-
 * triggeren skal ikke blinke panelet.
 *
 * Nav-item spec (fra Paper A4-0 / A5-0):
 *   - Høyde: 72px (`h-header`)
 *   - Padding-inline: 16px (`px-sp-3`)
 *   - Gap label↔chevron: 5px — single-use arbitrary, paper-exact
 *   - Tekst: 14/18 Satoshi Bold Kuro (`text-body-sm font-bold text-kuro`)
 *   - Aktiv: `border-b-2 border-aka` (nederste 2px)
 *   - Tilbud (accent): alltid `text-aka`, uten aktiv-border
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import type { NavItem } from '@/lib/nav/schema';

import { IconChevronDown } from './icons';
import { MegaMenu } from './MegaMenu';

const HOVER_CLOSE_DELAY_MS = 120;

type PrimaryNavProps = {
  items: ReadonlyArray<NavItem>;
};

export function PrimaryNav({ items }: PrimaryNavProps) {
  const pathname = usePathname();
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  // To separate refs: menubar-listen og mega-panelet er søsken i DOM etter
  // hoist-et (panelet lever ikke lenger inni <li>). Outside-click må sjekke
  // begge — ellers lukkes menyen før klikk registreres på mega-panel-lenker.
  const rootRef = useRef<HTMLUListElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navId = useId();

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpenIdx(null), HOVER_CLOSE_DELAY_MS);
  }, [clearCloseTimer]);

  const openAt = useCallback(
    (idx: number) => {
      clearCloseTimer();
      setOpenIdx(idx);
    },
    [clearCloseTimer],
  );

  // Lukk ved ruteendring — "adjusting state based on a prop" pattern.
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    if (openIdx !== null) setOpenIdx(null);
  }

  // ESC + outside-click. Outside = utenfor BÅDE menubar-listen og panel-innholdet.
  // Hvis vi bare sjekker menubar-ref, blir klikk på mega-menu-lenker feilaktig
  // tolket som "utenfor" → menyen lukkes før Link-navigasjon rekker å skje.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenIdx(null);
    }
    function onClick(e: MouseEvent) {
      if (!(e.target instanceof Node)) return;
      const inMenubar = rootRef.current?.contains(e.target) ?? false;
      const inPanel = panelRef.current?.contains(e.target) ?? false;
      if (!inMenubar && !inPanel) setOpenIdx(null);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, []);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  // Pre-compute currently-open item så vi kan rendre én enkelt MegaMenu-instans
  // som søsken av <ul>. Dette gjør at panelets `absolute left-0 right-0` anker
  // mot HeaderDesktop's outer `relative isolate`-wrapper (= hele header-bredden)
  // i stedet for et enkelt <li> (= kun trigger-bredden, som ga bleed-through).
  const openItem =
    openIdx !== null && openIdx < items.length ? items[openIdx] : null;
  const openHasMega = Boolean(
    openItem?.mega &&
      (openItem.mega.overview ||
        openItem.mega.groups.length > 0 ||
        openItem.mega.editorial),
  );
  const openPanelId = openIdx !== null ? `${navId}-panel-${openIdx}` : '';

  return (
    <>
      <ul
        ref={rootRef}
        role="menubar"
        aria-label="Hovedmeny"
        className="flex h-header items-stretch"
        onMouseLeave={scheduleClose}
      >
        {items.map((item, idx) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + '/');
          const hasMega = Boolean(
            item.mega &&
              (item.mega.overview ||
                item.mega.groups.length > 0 ||
                item.mega.editorial),
          );
          const panelId = `${navId}-panel-${idx}`;
          const isOpen = openIdx === idx;

          return (
            <li
              key={item.href}
              role="none"
              className="flex"
              onMouseEnter={() => (hasMega ? openAt(idx) : setOpenIdx(null))}
            >
              {hasMega ? (
                <NavTrigger
                  item={item}
                  active={isActive}
                  open={isOpen}
                  panelId={panelId}
                  onActivate={() => openAt(idx)}
                  onClose={() => setOpenIdx(null)}
                  onKey={(e) => {
                    // Down/Up/Space åpner mega-menyen.
                    // Enter (uten modifier) lar Link navigere som vanlig.
                    if (e.key === 'ArrowDown' || e.key === ' ') {
                      e.preventDefault();
                      openAt(idx);
                    }
                  }}
                />
              ) : (
                <NavLink item={item} active={isActive} />
              )}
            </li>
          );
        })}
      </ul>

      {openHasMega && openItem?.mega && (
        <MegaMenu
          rootRef={panelRef}
          mega={openItem.mega}
          open={true}
          id={openPanelId}
          // Mouse-enter på panelet kansellerer scheduled close fra <ul>'s
          // onMouseLeave. Uten dette rekker close-timeren å fyre mens musen
          // krysser gapet fra trigger-rad til panel.
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleClose}
          // Synkron lukk ved klikk på hvilken som helst Link inni panelet.
          // usePathname-effekten over dekker stort sett samme case, men
          // (a) navigasjon til identisk rute endrer ikke pathname, og
          // (b) transition-timingen kan la panelet blinke ett frame på ny side.
          onNavigate={() => setOpenIdx(null)}
        />
      )}
    </>
  );
}

// ----- Sub-komponenter ------------------------------------------------------

/**
 * Shared styling for nav-items. 5px gap = Paper A4-0 computed spacing
 * (single-use, paper-exact).
 */
function navItemClasses(active: boolean, accent: boolean | undefined): string {
  const base =
    'inline-flex items-center gap-[5px] h-header px-sp-3 text-body-sm font-bold border-b-2 border-transparent transition-colors'; /* paper-exact: A4-0 */
  if (accent) return `${base} text-aka hover:text-aka-dark`;
  if (active) return `${base} text-ink border-aka hover:text-aka`;
  return `${base} text-ink hover:text-aka`;
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={navItemClasses(active, item.accent)}
      aria-current={active ? 'page' : undefined}
    >
      {item.label}
    </Link>
  );
}

type NavTriggerProps = {
  item: NavItem;
  active: boolean;
  open: boolean;
  panelId: string;
  onActivate: () => void;
  onClose: () => void;
  onKey: (e: ReactKeyboardEvent<HTMLAnchorElement>) => void;
};

/**
 * NavTrigger for items med mega-menu. Hybrid: hover åpner menyen, klikk på
 * label-en navigerer til hovedkategorien (tidligere åpnet kun menyen — det
 * gjorde kategori-siden uoppnåelig fra desktop-nav).
 *
 * ARIA: vi beholder aria-haspopup på Link'en — gyldig per ARIA 1.2 og
 * skjermlesere annonserer både "lenke" og "har popup". Down-arrow / Space
 * åpner menyen for tastatur-brukere; Enter navigerer (Link-default).
 *
 * Mobile/touch: hover-pattern faller bort — touch-brukere får direkte
 * navigasjon ved tap. Mobil-drawer (G2-0) har egen menu-trigger-pattern.
 */
function NavTrigger({
  item,
  active,
  open,
  panelId,
  onActivate,
  onClose,
  onKey,
}: NavTriggerProps) {
  return (
    <Link
      href={item.href}
      aria-haspopup="true"
      aria-expanded={open}
      aria-controls={panelId}
      aria-current={active ? 'page' : undefined}
      onMouseEnter={onActivate}
      onFocus={onActivate}
      onKeyDown={onKey}
      onClick={onClose}
      className={navItemClasses(active, item.accent)}
    >
      {item.label}
      <IconChevronDown
        size={12}
        className={[
          'text-current transition-transform duration-150',
          open ? 'rotate-180' : '',
        ].join(' ')}
      />
    </Link>
  );
}
