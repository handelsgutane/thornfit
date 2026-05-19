'use client';

/**
 * Tømmer Zustand-cart ved mount. Brukes av takk-for-handelen-siden etter
 * vellykket ordre-create — brukeren skal ikke komme tilbake til checkout og
 * se gamle items.
 *
 * Idempotent: kjører kun én gang per mount via useRef.
 */

import { useEffect, useRef } from 'react';

import { useCartStore } from '@/lib/cart/store';

export function ClearCartOnMount() {
  const cleared = useRef(false);
  const clear = useCartStore((s) => s.clear);

  useEffect(() => {
    if (cleared.current) return;
    cleared.current = true;
    clear();
  }, [clear]);

  return null;
}
