'use client';

/**
 * useHoverOpen — delt hook for hover/focus-drevne popover-paneler.
 *
 * Filterbaren skal åpne dropdowns ved å holde over dem (desktop-mønster),
 * ikke krever klikk. Samtidig må vi støtte:
 *
 *   - Tastatur — `Tab` inn åpner, `Escape` lukker, `Tab` ut lukker.
 *   - Touch — hover-event fyres ikke pålitelig, så klikk er fallback.
 *   - Mus-krysning fra summary → panel — liten delay før close så bruker
 *     kan bevege pekeren ned i panelet uten at det lukkes underveis.
 *
 * Returnerer både `open`-state, `containerProps` (for ytterste wrapper) og
 * `triggerProps` (for knappen) som appenderes via spread. Komponentene som
 * bruker hook-en trenger bare `open && <Panel .../>`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FocusEvent as ReactFocusEvent } from 'react';

const CLOSE_DELAY_MS = 120;

export interface UseHoverOpenResult {
  open: boolean;
  /** Sett `ref` på ytterste wrapper-div så click-outside og blur-outside
   *  detekteres korrekt. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  containerProps: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onFocus: () => void;
    onBlur: (e: ReactFocusEvent<HTMLElement>) => void;
  };
  triggerProps: {
    'aria-expanded': boolean;
    'aria-haspopup': 'menu';
    onClick: () => void;
  };
  close: () => void;
}

export function useHoverOpen(): UseHoverOpenResult {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openNow = useCallback(() => {
    clearCloseTimer();
    setOpen(true);
  }, [clearCloseTimer]);

  const closeSoon = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [clearCloseTimer]);

  const close = useCallback(() => {
    clearCloseTimer();
    setOpen(false);
  }, [clearCloseTimer]);

  // Cleanup timer ved unmount
  useEffect(() => {
    return () => clearCloseTimer();
  }, [clearCloseTimer]);

  // Escape-tasten lukker
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  return {
    open,
    containerRef,
    containerProps: {
      onMouseEnter: openNow,
      onMouseLeave: closeSoon,
      onFocus: openNow,
      onBlur: (e) => {
        // Lukk kun hvis fokus forlater hele gruppen — ikke når fokus flyttes
        // mellom knapp og panel-items.
        const next = e.relatedTarget as Node | null;
        if (!next || !containerRef.current?.contains(next)) {
          closeSoon();
        }
      },
    },
    triggerProps: {
      'aria-expanded': open,
      'aria-haspopup': 'menu',
      onClick: () => setOpen((o) => !o),
    },
    close,
  };
}
