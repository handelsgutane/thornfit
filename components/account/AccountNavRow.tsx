/**
 * AccountNavRow — én rad i konto-nav (Paper 6B7-0 sidebar + 7SO-0 mobile hub).
 *
 * Brukes både i desktop sidebar (`AccountSidebar`) og mobile hub
 * (`AccountMobileHub`). Visualet er IKKE identisk:
 *
 *   - layout=sidebar (6B7-0): 260×40-rad, py-2.75 px-3, rounded-1, gap-2.5,
 *     icon 16, chevron 14, ikke divider mellom rader. Active = bg-ink, inactive
 *     = ingen bg.
 *   - layout=hub (7SO-0): 51px høy rad, px-sp-4, border-b mellom rader, icon
 *     20, chevron 16. Aldri "active"-state — hub er bare gateway.
 *
 * Variants:
 *   - default — standard nav-rad.
 *   - danger  — kun for "Logg ut"-raden i mobile hub (rød ink, ingen chevron).
 *
 * NB: Logg ut-raden i desktop-sidebar har sin egen rendering i
 * `AccountSidebar` (border-top + plain gray Logg ut + icon). Den bruker IKKE
 * AccountNavRow fordi visualet skiller seg nok fra både default og danger
 * (ingen chevron, ingen rounded, ingen padding-y-mismatch).
 */

import Link from 'next/link';

import { cn } from '@/lib/utils/cn';
import { AccountIcon } from './AccountIcon';
import type { AccountNavIcon } from '@/lib/account/info';

interface AccountNavRowProps {
  readonly href: string;
  readonly label: string;
  readonly icon: AccountNavIcon | 'logout';
  readonly active?: boolean;
  readonly variant?: 'default' | 'danger';
  /** Hvis sant rendres `<button>` istedenfor `<Link>`. Brukes for logg-ut-rad
   *  på mobil-hub som POSTer til /api/auth/logout. */
  readonly asButton?: boolean;
  readonly onClick?: () => void;
  readonly disabled?: boolean;
  /** Layout-variant — `sidebar` brukes på desktop, `hub` brukes på mobile hub. */
  readonly layout?: 'sidebar' | 'hub';
  /** Override label på pending-state (asButton-only). */
  readonly children?: never;
}

export function AccountNavRow({
  href,
  label,
  icon,
  active = false,
  variant = 'default',
  asButton = false,
  onClick,
  disabled = false,
  layout = 'sidebar',
}: AccountNavRowProps) {
  const isDanger = variant === 'danger';
  // Sidebar har ALLTID chevron (hver nav-rad i 6B7-0 ender med polyline
  // chevron). Mobile hub har chevron unntatt på danger-raden.
  const showChevron = layout === 'sidebar' || (layout === 'hub' && !isDanger);

  const baseClasses = cn(
    'group flex w-full items-center justify-between transition-colors',
    layout === 'hub'
      ? 'h-(--height-account-row) px-sp-4 border-b border-divider gap-sp-3'
      : 'h-(--height-account-row-desktop) rounded-1 px-sp-3 gap-sp-2',
    layout === 'sidebar' && active
      ? 'bg-ink text-ink-inverse'
      : isDanger
        ? 'text-aka hover:bg-aka/5'
        : 'text-ink hover:bg-surface-hover',
    disabled && 'cursor-not-allowed opacity-60',
  );

  const iconColor = active
    ? 'text-ink-inverse'
    : isDanger
      ? 'text-aka'
      : 'text-ink-muted group-hover:text-ink';

  const labelColor = active
    ? 'text-ink-inverse'
    : isDanger
      ? 'text-aka'
      : layout === 'sidebar'
        ? 'text-ink-muted group-hover:text-ink'
        : 'text-ink';

  const iconSize = layout === 'sidebar' ? 16 : 20;
  const chevronSize = layout === 'sidebar' ? 14 : 16;
  const labelTextClass = layout === 'sidebar' ? 'text-body-sm' : 'text-body-sm';
  const labelWeight = active ? 'font-bold' : 'font-medium';

  const content = (
    <>
      <span className="flex min-w-0 items-center gap-sp-2">
        <span
          className={cn('flex shrink-0 items-center justify-center', iconColor)}
          aria-hidden
        >
          <AccountIcon id={icon} size={iconSize} />
        </span>
        <span
          className={cn(
            'truncate text-left',
            labelTextClass,
            labelWeight,
            labelColor,
          )}
        >
          {label}
        </span>
      </span>
      {showChevron && (
        <span
          className={cn(
            'flex shrink-0 items-center justify-center',
            active ? 'text-ink-inverse' : 'text-ink-muted',
          )}
          aria-hidden
        >
          <AccountIcon id="chevron" size={chevronSize} />
        </span>
      )}
    </>
  );

  if (asButton) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={baseClasses}
        aria-label={label}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={href}
      className={baseClasses}
      aria-current={active ? 'page' : undefined}
    >
      {content}
    </Link>
  );
}
