/**
 * Breadcrumb — gjenbrukbar brødsmule-navigasjon.
 *
 * Ment å fungere både på lys og mørk bakgrunn. Farge og hover-farge styres
 * av props fordi Breadcrumb sitter inne i forskjellige contexter (svart hero,
 * hvit filterbar, etc.) og currentColor-triks alene ikke dekker ønsket hover-
 * kontrast på tvers.
 *
 * Paper-refs: node 383-0 / 384-0 (brødsmule i default kategori-hero).
 * Typografi: 12px regular (text-muted-sm), 6px gap mellom segmenter.
 *
 * Semantikk: rendret som `<nav aria-label="Brødsmuler">` med `aria-current="page"`
 * på siste segment. Siste segment er alltid ren tekst (ikke lenke) selv om en
 * `href` skulle være oppgitt.
 */

import Link from 'next/link';
import { Fragment } from 'react';

export interface BreadcrumbItem {
  /** Visningstekst. Stripes ikke — anta caller har renset HTML. */
  label: string;
  /** Valgfri — siste item er alltid non-link uansett. */
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  /**
   * Tailwind-klasser for container — tillater override av farge og margin.
   * Default passer for mørk bakgrunn (haiiro tekst).
   */
  className?: string;
  /**
   * Hover-farge for lenker. Må settes eksplisitt fordi Breadcrumb brukes på
   * både mørk og lys bakgrunn og vi vil ha forskjellig hover-kontrast.
   * Default `hover:text-shiro` passer for mørk bakgrunn.
   */
  linkHoverClassName?: string;
}

export function Breadcrumb({
  items,
  className,
  linkHoverClassName = 'hover:text-shiro',
}: BreadcrumbProps) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Brødsmuler"
      className={[
        'flex flex-wrap items-center gap-[6px] text-muted-sm' /* paper-exact: 384-0 gap 6px */,
        className ?? 'text-haiiro',
      ].join(' ')}
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <Fragment key={`${item.label}-${i}`}>
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className={`transition-colors ${linkHoverClassName}`}
              >
                {item.label}
              </Link>
            ) : (
              <span aria-current={isLast ? 'page' : undefined}>{item.label}</span>
            )}
            {!isLast && (
              <span aria-hidden className="opacity-60">
                /
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
