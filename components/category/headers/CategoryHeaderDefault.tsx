/**
 * CategoryHeaderDefault — svart "editorial band" på toppen av en kategori-side.
 *
 * Paper-refs:
 *   - 380-0  Hero-container (bg #1A1A1A, padding 40px 64px 36px 64px,
 *            flex-direction row, align-items flex-end, justify-content
 *            space-between)
 *   - 381-0  Venstre blokk (kolonne, 8px gap: brødsmule → tittel → beskrivelse)
 *   - 383-0  Brødsmule — 12px haiiro
 *   - 386-0  Tittel — 40px Satoshi Bold, -0.02em tracking, 110% line-height,
 *            shiro farge
 *   - 387-0  Beskrivelse — 14px haiiro, max-width 480px, 160% line-height
 *            (implementert: text-shiro — hvit er valgt over haiiro for
 *            bedre kontrast og lesbarhet mot bg-kuro, per Alexander 2026-04-29)
 *   - 388-0  Antall produkter — 13px haiiro, høyrestilt
 *
 * Alltid mørk uansett light/dark mode — dette er en editorial band hvor
 * identiteten er viktigere enn mode (ref ADR-0008, "Brand-tokens kun der
 * designet dikterer identisk utseende i begge moduser"). Derfor brukes
 * brand-fikserte tokens (bg-kuro, text-shiro, text-haiiro), ikke semantic
 * tokens som flipper.
 *
 * Data-kilde: alle felt finnes allerede i `categories`-tabellen synket fra
 * WooCommerce (`name`, `description`, `slug`, `parent_id`). Ingen ACF-
 * avhengigheter for default-varianten.
 */

import { Breadcrumb, type BreadcrumbItem } from '../Breadcrumb';

export interface CategoryHeaderDefaultProps {
  title: string;
  /**
   * Kategori-beskrivelse fra WooCommerce. HTML-taggene strippes før
   * rendering så vi garantert får én ren linje i hero-blokken. Rik beskrivelse
   * hører hjemme lenger ned på siden hvis vi trenger det.
   */
  description?: string | null;
  productCount: number;
  breadcrumb: BreadcrumbItem[];
}

/** Strip HTML til ren tekst. Trivielt — trenger ingen parser-avhengighet for
 *  korte beskrivelser. Normaliserer også whitespace. */
function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function CategoryHeaderDefault({
  title,
  description,
  productCount,
  breadcrumb,
}: CategoryHeaderDefaultProps) {
  const cleanDescription = description ? stripHtml(description) : null;

  return (
    <section
      aria-label={`${title} — kategorihode`}
      className={[
        'w-full bg-kuro text-shiro',
        'flex flex-col gap-sp-4 sm:flex-row sm:items-end sm:justify-between sm:gap-sp-6',
        'px-sp-4 sm:px-sp-7',
        'pt-[40px] pb-[36px]' /* paper-exact: 380-0 padding y 40/36 — utenfor sp-skala */,
      ].join(' ')}
    >
      <div className="flex flex-col gap-sp-2 max-w-3xl">
        <Breadcrumb
          items={breadcrumb}
          className="text-haiiro"
          linkHoverClassName="hover:text-shiro"
        />

        <h1 className="text-h1 font-bold text-shiro">{title}</h1>

        {cleanDescription && (
          <p
            className={[
              // Bevisst avvik fra Paper 387-0 (14px haiiro) — to brand-valg
              // fra Alexander: text-body (16px/26px) for roligere lesbarhet,
              // og text-shiro (hvit) fremfor haiiro (grå) for bedre kontrast
              // og lesbarhet mot bg-kuro.
              'text-body font-normal text-shiro',
              // Bredde: mobil-fallback `max-w-lg` (32rem ≈ 512px) for lesbar
              // line-length. På md+ binder vi til --width-hero-text (50%) —
              // brand-valg 2026-04-24, overstyrer Paper 387-0 (480px).
              'max-w-lg md:max-w-(--width-hero-text)',
            ].join(' ')}
          >
            {cleanDescription}
          </p>
        )}
      </div>

      <p className="text-body-xs text-haiiro shrink-0">
        {productCount} produkt{productCount === 1 ? '' : 'er'}
      </p>
    </section>
  );
}
