/**
 * Logo — THORN FIT brand-mark (stacked: "THORN" over "FIT", høyrejustert).
 *
 * Vektoriserte glyf-outlines fra Morganite ExtraBold (uthentet med fonttools
 * fra kildefonten). Path-data er font-UAVHENGIG — logoen rendres identisk
 * uansett om Morganite er lastet, så vi slipper Adobe Fonts-kit / fallback til
 * Impact. Regenerering: se /tmp/gen_thornfit_logo.py-mønsteret om bokstaver
 * eller layout skal endres (krever Morganite-ExtraBold.ttf + fonttools).
 *
 * Fargestrategi (ADR-0008):
 *   - `<g fill="currentColor">` → parent styrer farge via Tailwind. Normalt
 *     `text-ink` (semantic token som flipper kuro↔shiro med `data-theme` +
 *     prefers-color-scheme). På alltid-mørke flater (footer, drawer) settes en
 *     brand-fixed lys farge utenfra (f.eks. `text-unohana` / `text-shiro`).
 *
 * De flate svart/hvit-variantene ligger i
 * `public/brand/thornfit-logo-vertical-{black,white}.svg` for bruk der
 * currentColor ikke gjelder (og:image, e-post, eksterne flater).
 *
 * viewBox er tett rundt selve glyfene (~253×218, ~1.16:1) — IKKE 400×220 med
 * skjev tom-plass, som tidligere klemte/forskjøv logoen i header. Path-ene
 * står i opprinnelige absolutt-koordinater; viewBox cropper bare til innholdet.
 * Størrelse styres utenfra via `className` (f.eks. `h-10 w-auto` desktop,
 * `h-9 w-auto` mobil).
 *
 * `variant` er reservert for en framtidig kompakt mobilvariant (uten "FIT") —
 * ignoreres bevisst i dag, samme asset rendres for begge.
 */

import type { SVGProps } from 'react';

type LogoProps = SVGProps<SVGSVGElement> & {
  variant?: 'desktop' | 'mobile';
  /** Tekstalternativet for assistive tech. */
  title?: string;
};

export function Logo({ variant, title = 'THORN FIT', className, ...rest }: LogoProps) {
  void variant;
  return (
    <svg
      role="img"
      aria-label={title}
      viewBox="147.8 3 253.04 218"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...rest}
    >
      <title>{title}</title>
      <g fill="currentColor">
        {/* THORN — Morganite ExtraBold, font-size 200, høyrejustert ved x=395 */}
        <path transform="translate(153.4 150) scale(0.2 -0.2)" d="M229 625H160V0H71V625H2V699H229Z" />
        <path transform="translate(197.6 150) scale(0.2 -0.2)" d="M230 699V0H141V316H103V0H14V699H103V382H141V699Z" />
        <path transform="translate(244.4 150) scale(0.2 -0.2)" d="M113 -6Q95 -6 77.0 0.0Q59 6 44.5 18.5Q30 31 21.5 51.0Q13 71 13 98V601Q13 628 21.5 648.0Q30 668 44.5 680.5Q59 693 77.0 699.0Q95 705 113 705H131Q150 705 168.0 699.0Q186 693 200.0 680.5Q214 668 222.5 648.0Q231 628 231 601V98Q231 71 222.5 51.0Q214 31 200.0 18.5Q186 6 168.0 0.0Q150 -6 131 -6ZM120 631Q102 631 102 588V111Q102 68 120 68H124Q142 68 142 111V588Q142 631 124 631Z" />
        <path transform="translate(291.2 150) scale(0.2 -0.2)" d="M232 417Q232 385 222.0 369.5Q212 354 197 349Q212 345 222.0 329.5Q232 314 232 282V131Q232 59 237.5 30.5Q243 2 245 0H156Q148 12 145.5 43.0Q143 74 143 131V274Q143 316 126 316H103V0H14V699H133Q175 699 203.5 672.0Q232 645 232 596ZM126 382Q143 382 143 422V582Q143 625 124 625H103V382Z" />
        <path transform="translate(339.6 150) scale(0.2 -0.2)" d="M166 0 89 422H88V0H13V699H112L182 287H183V699H264V0Z" />
        {/* FIT — font-size 80, høyrejustert ved x=395 */}
        <path transform="translate(351.56 215) scale(0.08 -0.08)" d="M103 625V382H170V316H103V0H14V699H188V625Z" />
        <path transform="translate(367.16 215) scale(0.08 -0.08)" d="M103 699V0H14V699Z" />
        <path transform="translate(376.52 215) scale(0.08 -0.08)" d="M229 625H160V0H71V625H2V699H229Z" />
      </g>
    </svg>
  );
}
