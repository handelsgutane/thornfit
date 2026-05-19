/**
 * Next.js middleware — kjører før hver request og injiserer `x-pathname`-
 * headeren. Server-komponenter kan så lese pathname via `headers()` for å
 * conditionally rendre eller skippe layout-elementer (f.eks. global Header
 * skjules på /checkout for distraksjonsfri kjøps-flyt).
 *
 * Holdes minimal med vilje. Authorisasjon, redirects osv. legges til etter
 * behov; for nå er det kun pathname-injection.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Hopp over /_next, /api, statiske assets og favicon for ytelse.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
