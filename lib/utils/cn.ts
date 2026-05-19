import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Tailwind-merge konfigurert med alle custom font-size tokens fra @theme.
 *
 * Uten dette tror tailwind-merge at `text-body-sm`, `text-h3` osv. er
 * fargeklasser (samme gruppe som `text-white`, `text-ink`), og fjerner
 * fargeklassen når begge finnes i samme cn()-kall. F.eks.:
 *   cn('text-white', 'text-body-sm')  →  bare 'text-body-sm' uten fix
 *   cn('text-white', 'text-body-sm')  →  begge beholdes med fix
 *
 * Alle `--text-*`-tokens fra `app/globals.css` må stå her.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        'text-display',
        'text-h1',
        'text-h2',
        'text-h3',
        'text-h4',
        'text-body',
        'text-body-md',
        'text-body-sm',
        'text-body-xs',
        'text-muted-sm',
        'text-label',
        'text-label-sm',
        'text-utility',
        'text-pill',
        'text-table-header',
        'text-date',
        'text-date-mobile',
      ],
    },
  },
});

/**
 * Merge Tailwind classes with conflict resolution.
 *
 * ```tsx
 * <div className={cn('p-4 bg-shiro', isActive && 'bg-aka', className)} />
 * ```
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
