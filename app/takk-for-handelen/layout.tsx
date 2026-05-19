/**
 * Layout-shell for legacy `/takk-for-handelen` — redirecter til
 * `/konto/ordrer`. Beholdt midlertidig for bakoverkompatibilitet.
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function TakkForHandelenLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return children;
}
