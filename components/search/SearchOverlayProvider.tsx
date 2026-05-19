'use client';

/**
 * SearchOverlayProvider — React-context som styrer åpne/lukke av søke-overlayet.
 *
 * Paret lig chef-storefront sin `SearchOverlayRoot`/`SearchOverlayTrigger` —
 * forskjellen er at vi bytter én overlay-komponent for mobile/desktop basert
 * på media-query slik at bundelen ikke rendrer begge samtidig.
 *
 * Bruk:
 *
 *   // Wrapper hele app-treet (én gang, i Header eller layout).
 *   <SearchOverlayProvider>
 *     {children}
 *   </SearchOverlayProvider>
 *
 *   // Button hvor som helst under:
 *   <SearchOverlayTrigger>Søk</SearchOverlayTrigger>
 *
 * Provider rendrer overlay-et betinget via React portal (ikke JSX inline) så
 * det alltid er `document.body`-nivå — ellers arver det stacking context og
 * overflow-clip fra parent, og «fullscreen» slutter å være det.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';

import { SearchOverlay } from './SearchOverlay';

type SearchOverlayCtx = {
  open: () => void;
  close: () => void;
  isOpen: boolean;
};

const Ctx = createContext<SearchOverlayCtx | null>(null);

export function useSearchOverlay(): SearchOverlayCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error('useSearchOverlay must be used inside <SearchOverlayProvider>');
  }
  return ctx;
}

/**
 * SSR-trygg flag for når vi er i nettleseren. Bruker `useSyncExternalStore`
 * (React-blessed API for client/server-gating) framfor en klassisk
 * `useState(false)` + `useEffect(() => setMounted(true))` — som React 19's
 * nye `react-hooks/set-state-in-effect`-regel flagger som anti-pattern.
 */
function useIsBrowser(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function SearchOverlayProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const isBrowser = useIsBrowser();

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  // Body-scroll-lås. Provider-nivå så vi kan dele den mellom desktop- og
  // mobile-overlay; ellers ville hver komponent måtte duplisere effekten.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [isOpen]);

  // Esc lukker. Lever på window, ikke panel — så det virker før fokus
  // er satt på input.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, close]);

  const value = useMemo<SearchOverlayCtx>(
    () => ({ open, close, isOpen }),
    [open, close, isOpen],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {isBrowser && isOpen
        ? createPortal(<SearchOverlay onClose={close} />, document.body)
        : null}
    </Ctx.Provider>
  );
}

// ---------- Trigger --------------------------------------------------------

type TriggerProps = {
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  onClick?: () => void;
};

/**
 * Knapp som åpner overlay-et. Tar et valgfritt `onClick` så eksisterende
 * lukke-handlere (f.eks. MobileDrawer) kan kjøres før vi åpner søk.
 */
export function SearchOverlayTrigger({
  children,
  className,
  ariaLabel = 'Søk',
  onClick,
}: TriggerProps) {
  const { open } = useSearchOverlay();
  return (
    <button
      type="button"
      onClick={() => {
        onClick?.();
        open();
      }}
      aria-label={ariaLabel}
      className={className}
    >
      {children}
    </button>
  );
}
