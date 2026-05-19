/**
 * OrdersHeader — page-header for Mine ordrer (Paper 6B7-0 6EF-0 desktop,
 * B6Q-0 B7D-0 mobile).
 *
 * To distinkte layouter:
 *
 * Desktop (≥lg) — Paper 6EF-0:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  Mine ordrer                                                 │
 *   │  12 ordrer totalt                                            │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Mobile (<lg) — Paper B7D-0:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  ←  Mine ordrer                                   12 totalt  │
 *   └──────────────────────────────────────────────────────────────┘
 *   Back-chevron (link til `/konto`), tittel 17px bold, count inline
 *   til høyre. Border-bottom 1px divider. Padding 16px×20px (`py-sp-3
 *   px-5`). Tittelen er bevisst mindre enn desktop-h2 — mobil har egen
 *   visuell hierarki.
 *
 * NB: Søk-input er fjernet i denne iterasjonen (per Alexander). Strukturen
 * for å plugge inn et `search`-slot via prop er bevart konseptuelt — kommer
 * tilbake som drawer/sheet senere når vi har tydelig behov.
 */

import Link from 'next/link';

import {
  ORDERS_BACK_LABEL,
  ORDERS_SUBTITLE_MOBILE,
  ORDERS_SUBTITLE_PLURAL,
  ORDERS_SUBTITLE_SINGULAR,
  ORDERS_TITLE,
} from '@/lib/account/info';

interface OrdersHeaderProps {
  readonly count: number;
}

export function OrdersHeader({ count }: OrdersHeaderProps) {
  const subtitleSuffix =
    count === 1 ? ORDERS_SUBTITLE_SINGULAR : ORDERS_SUBTITLE_PLURAL;

  return (
    <>
      {/* Mobile-header — Paper B7D-0 */}
      <header className="-mx-sp-3 -mt-sp-5 flex items-center gap-sp-3 border-b border-divider bg-surface px-sp-5 py-sp-3 md:-mx-sp-7 lg:hidden">
        <Link
          href="/konto"
          aria-label={ORDERS_BACK_LABEL}
          className="flex size-5 shrink-0 items-center justify-center text-ink"
        >
          <BackChevron />
        </Link>
        <h1 className="grow text-h4 font-bold text-ink">{ORDERS_TITLE}</h1>
        <span className="shrink-0 text-muted-sm text-ink-muted">
          {count} {ORDERS_SUBTITLE_MOBILE}
        </span>
      </header>

      {/* Desktop-header — Paper 6EF-0 */}
      <header className="hidden flex-col gap-sp-1 pb-sp-4 lg:flex">
        <h1 className="text-h2 font-bold text-ink">{ORDERS_TITLE}</h1>
        <p className="text-body-sm text-ink-muted">
          {count} {subtitleSuffix}
        </p>
      </header>
    </>
  );
}

// ---------------------------------------------------------------------------
// BackChevron — 20×20 inline SVG (Paper B7E-0). Stroke 1.5px currentColor.
// Eget komponent her i stedet for `<AccountIcon id="chevron" />` siden den
// peker høyre (kun roterte hadde gått, men en dedikert venstre-pekende ikon
// er klarere semantikk).
// ---------------------------------------------------------------------------

function BackChevron() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}
