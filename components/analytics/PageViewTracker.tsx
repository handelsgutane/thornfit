'use client';

/**
 * PageViewTracker — fyrer `page_view`-event på hver route-endring.
 *
 * Next.js App Router rendrer ikke nye document.load-events ved SPA-navigasjon,
 * så pixlenes auto-pageview hopper over alle sider etter første paint. Vi
 * stiller det opp manuelt ved å lytte på `usePathname` + `useSearchParams`.
 *
 * Plassert i `app/layout.tsx` etter `<AnalyticsScripts>` slik at emitteren
 * har adaptere registrert før første event fyres.
 *
 * De-duplisering: `useRef` på siste path. Dersom React strict-mode kjører
 * effekten 2x i dev, fyrer vi kun én gang per faktisk pathendring.
 */

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';

import { track } from '@/lib/analytics/emitter';

function PageViewTrackerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastFired = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const qs = searchParams?.toString();
    const fullPath = qs ? `${pathname}?${qs}` : pathname;
    if (lastFired.current === fullPath) return;
    lastFired.current = fullPath;
    track({
      name: 'page_view',
      payload: {
        path: fullPath ?? '/',
        title: typeof document !== 'undefined' ? document.title : undefined,
        referrer:
          typeof document !== 'undefined' ? document.referrer || undefined : undefined,
      },
    });
  }, [pathname, searchParams]);

  return null;
}

export function PageViewTracker() {
  // Next 16 krever Suspense-grense rundt `useSearchParams`.
  return (
    <Suspense fallback={null}>
      <PageViewTrackerInner />
    </Suspense>
  );
}
