/**
 * CategoryFilterChip — klikkbar filter-pill for kategori-rader.
 *
 * Paper-refs:
 *   - 38R-0  Chip-container: rounded-1 (2px), padding 4/10, gap 6px,
 *            bg unohana / border sakai i light, surface-muted / divider
 *            i mørk (semantic tokens).
 *   - 38S-0  Chip-tekst: 12px Satoshi Medium, line-height 16px.
 *
 * Forskjellen fra `ActiveFilterChip`:
 *   - ActiveFilterChip har en × for å fjerne. Brukes for "aktivt valgt
 *     attributt"-visning i FilterBar.
 *   - CategoryFilterChip er en `<Link>` som veksler aktiv/inaktiv state
 *     ved navigasjon. Brukes på /tilbud og /sok hvor URL er kilden til
 *     sannheten.
 *
 * Visuelt match med ActiveFilterChip — samme høyde, padding og typografi
 * — slik at en filter-rad med blanding av "skifte"-chips og aktive-chips
 * ser visuelt enhetlig ut.
 *
 * Aktiv-state inverter: bg-ink + text-ink-inverse. Det er en bevisst skarp
 * kontrast (dark/light flip) for å gjøre valgt state umiskjennelig.
 */

import Link from 'next/link';

export interface CategoryFilterChipProps {
  label: string;
  href: string;
  active: boolean;
}

export function CategoryFilterChip({ label, href, active }: CategoryFilterChipProps) {
  const baseClasses = [
    'inline-flex items-center gap-[6px]' /* paper-exact: 38R-0 gap 6px */,
    'rounded-1 px-[10px] py-[4px]' /* paper-exact: 38R-0 padding 4/10 */,
    'text-muted-sm font-medium' /* paper-exact: 38S-0 12px Medium */,
    'transition-colors',
  ];

  const stateClasses = active
    ? ['border border-ink bg-ink text-ink-inverse']
    : [
        'border border-divider bg-surface-muted text-ink',
        'hover:bg-surface-hover hover:border-ink',
      ];

  return (
    <Link href={href} className={[...baseClasses, ...stateClasses].join(' ')}>
      {label}
    </Link>
  );
}
