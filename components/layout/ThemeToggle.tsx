'use client';

/**
 * ThemeToggle — lys/mørk-bryter for brukerpreferanse.
 *
 * Tilstand:
 *   - `light` / `dark` — brukeren har eksplisitt valgt. Lagres i localStorage
 *     (`skn-theme`) og speiles på `<html data-theme="…">`.
 *   - `system` — ingen override. `data-theme` attributtet fjernes og
 *     `@media (prefers-color-scheme: dark)` i globals.css tar over.
 *
 * Pre-hydrerings-scriptet i `app/layout.tsx` setter `data-theme` før første
 * paint, så toggle-en trenger ikke bekymre seg for flash. Komponenten leser
 * bare localStorage når den mounter.
 *
 * UI: én knapp som cycler light → dark → system → light. For en liten meny
 * lar det oss holde headeren ren og gi alle tre valgene uten dropdown.
 */

import { useEffect, useState } from 'react';

import { IconMoon, IconSun } from './icons';

type Theme = 'light' | 'dark' | 'system';
const STORAGE_KEY = 'skn-theme';

function readTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
    window.localStorage.removeItem(STORAGE_KEY);
  } else {
    root.setAttribute('data-theme', theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }
}

function nextTheme(current: Theme): Theme {
  if (current === 'light') return 'dark';
  if (current === 'dark') return 'system';
  return 'light';
}

function labelFor(theme: Theme): string {
  if (theme === 'light') return 'Lys modus (trykk for mørk)';
  if (theme === 'dark') return 'Mørk modus (trykk for system)';
  return 'System-modus (trykk for lys)';
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('system');
  const [mounted, setMounted] = useState(false);

  // Mount-sync med localStorage. Dette er en legitim "synkroniser med
  // ekstern kilde"-effekt: browser-storage er utenfor React, og vi leser
  // den kun én gang etter hydrering. Regelen `set-state-in-effect` er ment
  // å fange selvrefererende state-loops, ikke initial sync — derfor
  // disable-linjene under.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(readTheme());
    setMounted(true);
  }, []);

  function cycle() {
    const next = nextTheme(theme);
    setTheme(next);
    applyTheme(next);
  }

  // SSR-markup: nøytralt ikon (sol) for å unngå hydration-mismatch. Den
  // korrekte tilstanden settes idet komponenten mounter.
  const showMoon = mounted && theme === 'dark';

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={labelFor(theme)}
      title={labelFor(theme)}
      className={[
        'flex h-10 w-10 items-center justify-center rounded-sm text-ink hover:bg-surface-hover',
        className ?? '',
      ].join(' ')}
    >
      {showMoon ? <IconMoon size={18} /> : <IconSun size={18} />}
    </button>
  );
}
