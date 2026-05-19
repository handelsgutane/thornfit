'use client';

/**
 * Hook for asynkron postnummer-lookup mot Bring (via vår /api/postal-lookup-
 * proxy). Debouncer 250ms så vi ikke fyrer en request per tastetrykk.
 *
 * Bruksmønster:
 *   const lookup = usePostalLookup(postalCode);
 *   useEffect(() => {
 *     if (lookup.city && !cityManuallyEdited) setCity(lookup.city);
 *   }, [lookup.city]);
 */

import { useEffect, useState } from 'react';

export type PostalLookupStatus = 'idle' | 'loading' | 'valid' | 'invalid' | 'error';

export interface PostalLookupState {
  status: PostalLookupStatus;
  city: string | null;
}

const POSTAL_CODE_REGEX = /^\d{4}$/;

export function usePostalLookup(
  postalCode: string,
  debounceMs = 250,
): PostalLookupState {
  const [state, setState] = useState<PostalLookupState>({
    status: 'idle',
    city: null,
  });

  useEffect(() => {
    const trimmed = postalCode.trim();

    // Tom = idle, ikke loading.
    if (trimmed.length === 0) {
      setState({ status: 'idle', city: null });
      return;
    }

    // Ikke 4 siffer ennå — vis ingen feil ennå (brukeren skriver fortsatt).
    if (!POSTAL_CODE_REGEX.test(trimmed)) {
      setState({ status: 'idle', city: null });
      return;
    }

    setState((prev) => ({ ...prev, status: 'loading' }));
    const ctrl = new AbortController();

    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/postal-lookup?postnr=${encodeURIComponent(trimmed)}`,
          { signal: ctrl.signal },
        );
        if (!res.ok) {
          setState({ status: 'error', city: null });
          return;
        }
        const data = (await res.json()) as { valid: boolean; city: string | null };
        if (data.valid && data.city) {
          setState({ status: 'valid', city: data.city });
        } else {
          setState({ status: 'invalid', city: null });
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setState({ status: 'error', city: null });
      }
    }, debounceMs);

    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [postalCode, debounceMs]);

  return state;
}
