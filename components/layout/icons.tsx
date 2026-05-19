/**
 * Inline SVG-ikoner brukt i layout-komponentene (Header, Drawer, MegaMenu).
 *
 * Ingen ekstern icon-pakke (lucide etc.) av to grunner:
 *   1. Vi trenger veldig få ikoner i header-laget — å legge til en hel pakke
 *      gir mer kost enn nytte akkurat nå.
 *   2. Paper-designet bruker egne stroke-widths (1.5) og proporsjoner som vi
 *      vil matche nøyaktig; å tilpasse en lucide-variant til hvert kall er mer
 *      støyete enn å eie SVG-ene selv.
 *
 * Alle ikonene er rene presentasjonselementer — `aria-hidden` og tar et
 * `className` for styling. `size` bestemmer både w/h og viewBox-skala.
 */

type IconProps = {
  className?: string;
  /** Pixel-størrelse brukt for width/height. Default 16. */
  size?: number;
};

function base(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className,
  };
}

export function IconChevronDown({ size = 12, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function IconChevronRight({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function IconArrowRight({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M5 12h14" />
      <path d="M13 5l7 7-7 7" />
    </svg>
  );
}

export function IconSearch({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

export function IconUser({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4 4.5-6 8-6s7 2 8 6" />
    </svg>
  );
}

export function IconCart({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3 4h2l2.5 12.5a2 2 0 0 0 2 1.5h8.5a2 2 0 0 0 2-1.5L21 8H6" />
      <circle cx="10" cy="20.5" r="1" />
      <circle cx="17" cy="20.5" r="1" />
    </svg>
  );
}

/**
 * Paper-eksakt menu-icon (paper-ref: G5-0 på G2-0 "Nav — Mobile Header + Drawer").
 *
 * Asymmetrisk hamburger: topp- og bunnlinje 100% bredde, midtlinje 70%
 * (venstre-justert). Det er et bevisst stilvalg i Paper-designet — IKKE
 * bytt til symmetrisk tre-strek, for da mister vi signaturen.
 *
 * - Native viewBox 20×14 (ikke 24×24). Bredde/høyde skaleres proporsjonalt
 *   fra `size` (= bredde; høyde = size × 14/20 = 0.7 × size).
 * - stroke-width 1.8 — avviker fra den generelle 1.5 i denne fila fordi
 *   Paper bruker 1.8 for menu-icon spesifikt.
 */
export function IconMenu({ size = 20, className }: IconProps) {
  const height = (size * 14) / 20;
  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 20 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
      className={className}
    >
      <line x1="0" y1="1" x2="20" y2="1" />
      <line x1="0" y1="7" x2="14" y2="7" />
      <line x1="0" y1="13" x2="20" y2="13" />
    </svg>
  );
}

export function IconClose({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M6 6l12 12" />
      <path d="M18 6l-12 12" />
    </svg>
  );
}

export function IconHeart({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M20.8 8.6a5.2 5.2 0 0 0-8.8-3 5.2 5.2 0 0 0-8.8 3c0 6.4 8.8 11.4 8.8 11.4s8.8-5 8.8-11.4z" />
    </svg>
  );
}

export function IconSun({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.93 4.93l1.41 1.41" />
      <path d="M17.66 17.66l1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M4.93 19.07l1.41-1.41" />
      <path d="M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

export function IconMoon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
