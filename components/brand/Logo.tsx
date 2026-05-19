/**
 * Logo — Skarpekniver brand-mark.
 *
 * Wordmark: "SKARPE · KNIVER" med en rød sirkel (prikken) sentrert mellom.
 * Kilde-SVG: `SK_logo_black.svg` / `SK_logo_white.svg` (Adobe Illustrator export).
 *
 * Fargestrategi:
 *   - Bokstav-pathene bruker `fill="currentColor"`, slik at parent-komponenten
 *     styrer farge via Tailwind-klassen. Normalt `text-ink` (semantic token som
 *     flipper mellom kuro i light og shiro i dark — se ADR-0008). På dark
 *     surface som alltid skal være mørk (editorial-kolonne, footer) brukes
 *     `text-shiro` brand-fixed.
 *   - Sirkelen er låst til brand-rødt `#ea5532`. Denne skiller seg bevisst fra
 *     UI-aksenten Aka (#FF3333) — logoen er brand-merke, Aka er CTA-farge.
 *
 * Størrelse styres utenfra via `className` (f.eks. `h-9 w-auto` på desktop,
 * `h-5 w-auto` på mobil). Aspekt-ratio fra SVG holdes (748.32 × 117.92 ≈ 6.35:1).
 *
 * `variant`-propen reserveres for fremtidige optiske justeringer (f.eks.
 * kompakt mobilvariant uten wordmark). I dag rendres samme asset for begge.
 */

import type { SVGProps } from 'react';

type LogoProps = SVGProps<SVGSVGElement> & {
  variant?: 'desktop' | 'mobile';
  /** Tekstalternativet for assistive tech. */
  title?: string;
};

export function Logo({
  // `variant` er med i props-typen for API-stabilitet (og for framtidig kompakt
  // mobilvariant). I dag rendres samme asset uansett — ignoreres bevisst her.
  variant,
  title = 'Skarpekniver',
  className,
  ...rest
}: LogoProps) {
  void variant;
  return (
    <svg
      role="img"
      aria-label={title}
      viewBox="0 0 748.32 117.92"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...rest}
    >
      <title>{title}</title>
      <g fill="currentColor">
        <path d="M52.5,32.38c10.66,0,17.42,5.9,17.71,15.41h-9.22c-.22-4.54-3.46-7.2-8.64-7.2-5.69,0-9.36,2.74-9.36,7.13,0,3.74,2.02,5.83,6.41,6.84l8.28,1.8c9,1.94,13.39,6.55,13.39,14.4,0,9.79-7.63,16.13-19.22,16.13s-18.58-5.98-18.79-15.41h9.22c.07,4.46,3.67,7.13,9.58,7.13s10.01-2.66,10.01-7.06c0-3.53-1.8-5.62-6.12-6.55l-8.35-1.87c-8.93-1.94-13.61-7.06-13.61-15.12,0-9.22,7.63-15.62,18.72-15.62Z" />
        <path d="M92.97,60.96l21.31-27.65h10.87l-17.42,22.46,17.64,30.17h-10.66l-13.03-22.39-8.71,11.16v11.23h-9.22v-52.63h9.22v27.65Z" />
        <path d="M131.56,85.95l19.01-52.63h9.43l19.01,52.63h-9.72l-4.25-12.17h-19.66l-4.25,12.17h-9.58ZM148.12,66h14.26l-6.05-16.99c-.43-1.37-.94-2.95-1.08-4.03-.22,1.01-.65,2.59-1.15,4.03l-5.98,16.99Z" />
        <path d="M189.95,85.95v-52.63h20.09c11.95,0,18.94,6.05,18.94,16.42,0,7.06-3.31,12.1-9.5,14.62l10.01,21.6h-10.08l-8.93-19.66h-11.3v19.66h-9.22ZM199.17,58.15h10.87c5.83,0,9.29-3.1,9.29-8.42s-3.46-8.21-9.29-8.21h-10.87v16.63Z" />
        <path d="M251.73,67.8v18.14h-9.22v-52.63h20.81c10.58,0,17.42,6.91,17.42,17.21s-6.91,17.28-17.42,17.28h-11.59ZM251.73,41.52v18.07h9.65c6.34,0,9.72-3.38,9.72-9.14s-3.46-8.93-9.58-8.93h-9.79Z" />
        <path d="M292.84,85.95v-52.63h32.69v8.5h-23.47v13.54h21.02v8.14h-21.02v13.97h23.47v8.5h-32.69Z" />
        <path d="M446.26,60.96l21.31-27.65h10.87l-17.42,22.46,17.64,30.17h-10.66l-13.03-22.39-8.71,11.16v11.23h-9.22v-52.63h9.22v27.65Z" />
        <path d="M489.9,85.95v-52.63h9.14l24.7,37.3v-37.3h9.07v52.63h-9.07l-24.77-37.3v37.3h-9.07Z" />
        <path d="M558.01,85.95h-9.22v-52.63h9.22v52.63Z" />
        <path d="M568.88,33.31h9.79l11.52,30.31c1.15,3.17,2.16,6.26,3.31,10.51,1.3-4.61,2.38-7.85,3.38-10.51l11.38-30.31h9.58l-19.58,52.63h-9.5l-19.87-52.63Z" />
        <path d="M628.71,85.95v-52.63h32.69v8.5h-23.47v13.54h21.02v8.14h-21.02v13.97h23.47v8.5h-32.69Z" />
        <path d="M675.73,85.95v-52.63h20.09c11.95,0,18.94,6.05,18.94,16.42,0,7.06-3.31,12.1-9.5,14.62l10.01,21.6h-10.08l-8.93-19.66h-11.3v19.66h-9.22ZM684.94,58.15h10.87c5.83,0,9.29-3.1,9.29-8.42s-3.46-8.21-9.29-8.21h-10.87v16.63Z" />
      </g>
      <circle cx="382.46" cy="58.03" r="26.99" fill="#ea5532" />
    </svg>
  );
}
