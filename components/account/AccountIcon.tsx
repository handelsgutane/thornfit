/**
 * AccountIcon — inline SVG-ikoner for Profile-area nav (Paper 6B7-0 + 7SO-0).
 *
 * Holder ikonene som ren SVG (ikke `lucide-react` eller annen lib) for å:
 *   1. unngå runtime-import-cost i RSC,
 *   2. ha presis kontroll på stroke-width + viewBox så de matcher Paper,
 *   3. la `currentColor` styres av container (active-row har hvit ink, ellers
 *      ink/ink-muted via semantic tokens).
 *
 * Alle ikoner deler samme `size` (default 20) og `stroke=currentColor`. Mønster
 * matcher `AuthBenefits.tsx` så den interne stilen er konsistent på tvers av
 * konto-flatene.
 */

import type { AccountNavIcon } from '@/lib/account/info';

interface AccountIconProps {
  readonly id: AccountNavIcon | 'logout' | 'chevron' | 'search';
  readonly size?: number;
  readonly className?: string;
}

export function AccountIcon({ id, size = 20, className }: AccountIconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className,
  } as const;

  switch (id) {
    case 'package':
      return (
        <svg {...common}>
          <path d="M3.5 7.5l8.5-4 8.5 4v9l-8.5 4-8.5-4v-9z" />
          <path d="M3.5 7.5l8.5 4 8.5-4M12 11.5V20.5" />
        </svg>
      );
    case 'heart':
      return (
        <svg {...common}>
          <path d="M12 20.5l-7-6.5a4 4 0 016-5.5l1 1 1-1a4 4 0 016 5.5l-7 6.5z" />
        </svg>
      );
    case 'user':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20.5c1.5-3.5 4.5-5.5 8-5.5s6.5 2 8 5.5" />
        </svg>
      );
    case 'pin':
      return (
        <svg {...common}>
          <path d="M12 21s-6.5-6-6.5-11A6.5 6.5 0 1118.5 10c0 5-6.5 11-6.5 11z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      );
    case 'card':
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="13" rx="2" />
          <path d="M3 10h18M7 15h3" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.5 12a7.5 7.5 0 00-.1-1.3l2-1.5-2-3.4-2.3.9a7.5 7.5 0 00-2.3-1.3l-.4-2.4h-4l-.4 2.4a7.5 7.5 0 00-2.3 1.3l-2.3-.9-2 3.4 2 1.5a7.5 7.5 0 000 2.6l-2 1.5 2 3.4 2.3-.9a7.5 7.5 0 002.3 1.3l.4 2.4h4l.4-2.4a7.5 7.5 0 002.3-1.3l2.3.9 2-3.4-2-1.5c.07-.43.1-.86.1-1.3z" />
        </svg>
      );
    case 'logout':
      return (
        <svg {...common}>
          <path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3" />
          <path d="M10 17l-5-5 5-5M5 12h12" />
        </svg>
      );
    case 'chevron':
      return (
        <svg {...common}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
      );
    default:
      return null;
  }
}
