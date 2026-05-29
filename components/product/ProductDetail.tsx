/**
 * ProductDetail — full produktside (Paper DGN-1 desktop / DNW-1 mobil).
 *
 * Seksjoner:
 *   1. Hero split: gallery (venstre) + produktinfo (høyre)
 *   2. Leverandør-seksjon: mørkt bilde + tekst
 *   3. Beskrivelse: redaksjonell produkttekst
 *   4. Spesifikasjoner: tabell med nøkkel/verdi-rader
 *   5. Omtaler: rating-oversikt + 3 anmeldelseskort
 *   6. Relaterte produkter: 5-kol kortgrid
 *
 * Bruker ekte produktdata fra CatalogProductDetail for navn, bilder,
 * pris, attributter og rating. Resterende seksjoner viser dummy-innhold
 * som kan kobles til CMS/Woo-felter i neste iterasjon.
 */

import Link from 'next/link';

import { AddToCartButton } from '@/components/cart/AddToCartButton';
import { ProductGrid } from '@/components/ProductGrid';
import { UpsellCard } from './UpsellCard';
import { Button } from '@/components/ui/Button';
import { extractImages, type CatalogProductDetail } from '@/lib/supabase/catalog';
import { stripReviewHtml, formatReviewDate, type WooReview } from '@/lib/woo/reviews';
import { decodeHtmlEntities, sanitizeHtml, stripHtml } from '@/lib/utils/html';

import { ProductGallery } from './ProductGallery';
import { ProductGalleryDesktop } from './ProductGalleryDesktop';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProductDetailProps {
  product: CatalogProductDetail;
  slugSegments: string[];
  reviews: WooReview[];
  /** Brand som produktet tilhører — kan være null hvis produktet ikke er
   *  knyttet til en product_brand i Woo. */
  brand: import('@/lib/supabase/catalog').Brand | null;
  /** Forhåndshentede relaterte produkter — samme shape som kategori-grid. */
  relatedProducts: import('@/lib/supabase/catalog').CatalogListItem[];
  /** Upsell-produkt for "Vil du ha med?"-boksen. Null = skjul boksen. */
  upsellProduct: { product: CatalogProductDetail; path: string } | null;
}

// ---------------------------------------------------------------------------
// Formattering
// ---------------------------------------------------------------------------

const nok = new Intl.NumberFormat('nb-NO', {
  style: 'currency',
  currency: 'NOK',
  maximumFractionDigits: 0,
});

// ---------------------------------------------------------------------------
// Dummy-data (erstattes av CMS/Woo-felter)
// ---------------------------------------------------------------------------

const TRUST_ITEMS = [
  { text: 'Gratis frakt på ordrer over kr 2 500' },
  { text: '30 dagers returrett' },
];

/** Avled spesifikasjoner fra Woo-attributt-JSON. */
function deriveSpecs(
  raw: unknown,
  sku?: string | null,
): Array<{ key: string; value: string }> {
  const specs: Array<{ key: string; value: string }> = [];

  if (sku) {
    specs.push({ key: 'SKU', value: sku });
  }

  if (!Array.isArray(raw)) return specs;

  for (const attr of raw as Array<{
    name?: string;
    visible?: boolean;
    variation?: boolean;
    options?: unknown;
  }>) {
    if (!attr || typeof attr !== 'object') continue;
    if (attr.visible === false) continue;
    if (attr.variation === true) continue;
    if (typeof attr.name !== 'string' || attr.name.length === 0) continue;
    if (!Array.isArray(attr.options) || attr.options.length === 0) continue;

    // Woo lagrer attributt-options som ren tekst, men HTML-entiteter
    // (`&amp;`, `&oslash;` etc.) blir fortsatt liggende i payloaden. Vi
    // dekoder her så "Mat &amp; krydderier" rendres som "Mat & krydderier".
    const values = (attr.options as unknown[])
      .filter((o): o is string => typeof o === 'string' && o.length > 0)
      .map((o) => decodeHtmlEntities(o));
    if (values.length === 0) continue;

    specs.push({
      key: decodeHtmlEntities(attr.name),
      value: values.join(', '),
    });
  }

  return specs;
}


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StarRating({ value, max = 5, size = 16 }: { value: number; max?: number; size?: number }) {
  const filled = Math.round(value);
  return (
    <span className="flex items-center gap-[2px]" aria-label={`${value} av ${max} stjerner`}>
      {Array.from({ length: max }, (_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 12 12" fill="currentColor" aria-hidden className={i < filled ? 'text-kin' : 'text-divider'}>
          <path d="M6 1L7.545 4.13L11 4.635L8.5 7.07L9.09 10.5L6 8.88L2.91 10.5L3.5 7.07L1 4.635L4.455 4.13L6 1Z" />
        </svg>
      ))}
    </span>
  );
}

function SectionLabel({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      style={{ fontSize: 'var(--text-label)', lineHeight: 'var(--text-label--line-height)', letterSpacing: '0.12em' }}
      className={`block font-bold uppercase ${accent ? 'text-aka' : 'text-ink-muted'}`}
    >
      {children}
    </span>
  );
}

function TrustIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden className="shrink-0 text-ink">
      <path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M2 2h2l2.5 9H13l2-6H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7.5" cy="14.5" r="1" fill="currentColor" />
      <circle cx="12.5" cy="14.5" r="1" fill="currentColor" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 13.5C8 13.5 2 9.5 2 5.5C2 3.567 3.567 2 5.5 2C6.613 2 7.607 2.52 8 3.5C8.393 2.52 9.387 2 10.5 2C12.433 2 14 3.567 14 5.5C14 9.5 8 13.5 8 13.5Z" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Betalingslogoer — fra /public/payment/.
//
// Logoene er bare-vector (uten innebygd bakgrunn) — vi wrapper dem i en
// hvit pill med sakai-border slik at de leser konsistent på lyst og mørkt
// canvas-tema. Samme mønster som CardLogosRow i checkout (h-6 pill der,
// h-10 her siden produktsiden har mer plass). 56×40 pille gir nok rom for
// både kvadratiske (Mastercard, Maestro) og brede logoer (Klarna, Visa).
// ---------------------------------------------------------------------------

function PaymentLogoPill({ src, alt }: { src: string; alt: string }) {
  return (
    <span className="flex h-10 w-14 items-center justify-center rounded-1 border border-divider bg-white px-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element -- statiske SVG'er fra /public, optimaliseres ikke via next/image */}
      <img
        src={src}
        alt={alt}
        className="block h-6 w-auto max-w-full object-contain"
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}

function VisaLogo() {
  return <PaymentLogoPill src="/payment/visa.svg" alt="Visa" />;
}
function MastercardLogo() {
  return <PaymentLogoPill src="/payment/mastercard.svg" alt="Mastercard" />;
}
function AmexLogo() {
  return <PaymentLogoPill src="/payment/amex.svg" alt="American Express" />;
}
function VippsLogo() {
  return <PaymentLogoPill src="/payment/vipps.svg" alt="Vipps" />;
}
function KlarnaLogo() {
  return <PaymentLogoPill src="/payment/klarna.svg" alt="Klarna" />;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProductDetail({ product, slugSegments, reviews, brand, relatedProducts, upsellProduct }: ProductDetailProps) {
  const images = extractImages(product.images);
  const hasSale = product.sale_price !== null && product.regular_price !== null && product.sale_price < product.regular_price;
  const productPath = slugSegments.join('/');
  const brandLabel = product.primaryCategorySlug?.toUpperCase() ?? 'THORN FIT';
  const ratingValue = product.average_rating ?? 0;
  const ratingCount = product.rating_count ?? 0;
  const hasRating = ratingCount > 0;

  const specs = deriveSpecs(product.attributes, product.sku);

  return (
    <div className="w-full">

      {/* ================================================================
          1. HERO SPLIT — Outdoor Voices-stil
          Desktop: 65% galleri (bilder stablede vertikalt, scroller ned)
                 + 35% info (sticky — følger med ned til neste seksjon)
          Mobil:  thumbnail-galleri øverst + info under
          ================================================================ */}
      <div className="flex flex-col border-b border-divider bg-surface lg:flex-row lg:items-start">

        {/* ---- GALLERI — 65%, bilder stablede vertikalt ---- */}
        <div className="w-full lg:w-[65%] lg:shrink-0">

          {/* Mobil: kompakt thumbnail-galleri */}
          <div className="px-sp-3 py-sp-4 md:px-sp-7 lg:hidden">
            <ProductGallery images={images} productName={product.name} />
          </div>

          {/* Desktop: 2-kol grid med zoom-knapp og lightbox */}
          <div className="hidden lg:block">
            <ProductGalleryDesktop images={images} productName={product.name} />
          </div>
        </div>

        {/* ---- INFO — 35%, sticky desktop ----
            `self-start` er kritisk: uten den strekkes flex-elementet til
            galleriets fulle høyde og sticky virker ikke.
            top = utility-bar (28px) + header-bar (var --height-header 72px) = 100px */}
        <div
          className="flex flex-col border-t border-divider bg-surface px-sp-3 py-sp-4 md:px-sp-7 lg:w-[35%] lg:self-start lg:sticky lg:border-l lg:border-t-0 lg:px-sp-6 lg:py-12"
          style={{ top: 'calc(var(--height-header) + 28px)' }}
        >

          {/* Brand-rad (Paper DIL-1: 11px uppercase ink-muted, mb-16) */}
          <div className="mb-sp-3 flex items-center gap-sp-2">
            <span
              style={{ fontSize: 'var(--text-label)', lineHeight: '16px', letterSpacing: '0.1em' }}
              className="font-normal uppercase text-ink-muted"
            >
              {brandLabel}
            </span>
            {product.primaryCategorySlug && (
              <>
                <span className="text-ink-subtle" aria-hidden>·</span>
                <span
                  style={{ fontSize: 'var(--text-label)', lineHeight: '16px', letterSpacing: '0.1em' }}
                  className="font-normal uppercase text-ink-muted"
                >
                  Japan
                </span>
              </>
            )}
          </div>

          {/* Tittel — text-h1 (40px) på mobil, text-h2 (28px) på desktop.
              Tokens fra app/globals.css; ingen hardkodede px-verdier. */}
          <h1 className="mb-sp-2 font-bold text-ink text-h1 lg:text-h2">
            {product.name}
          </h1>

          {/* Spec-linje (Paper DIJ-1: 16px regular ink-muted, mb-16) */}
          {product.short_description && (
            <p className="mb-sp-3 text-body text-ink-muted">
              {stripHtml(product.short_description)}
            </p>
          )}

          {/* Rating — skjules hvis ingen anmeldelser */}
          {hasRating && (
            <div className="mb-sp-3 flex items-center gap-sp-2">
              <StarRating value={ratingValue} />
              <span className="text-body-xs text-ink-muted">
                {ratingValue.toFixed(1)} · {ratingCount} anmeldelser
              </span>
            </div>
          )}

          {/* Pris (Paper DI8-1: 32px bold + muted meta, mb-24 pb-24 border-bottom) */}
          <div className="mb-sp-2 flex items-baseline gap-sp-2">
            {hasSale ? (
              <>
                <span style={{ fontSize: '32px', lineHeight: '40px' }} className="font-bold text-aka">
                  {nok.format(product.sale_price as number)}
                </span>
                <span className="text-h3 text-ink-muted line-through">
                  {nok.format(product.regular_price as number)}
                </span>
              </>
            ) : product.price !== null ? (
              <span style={{ fontSize: '32px', lineHeight: '40px' }} className="font-bold text-ink">
                {nok.format(product.price)}
              </span>
            ) : null}
            <span className="text-body-xs text-ink-muted">inkl. mva</span>
          </div>

          {/* Stock-status — direkte under pris. Grønn = på lager, gul = lavt
              lager (≤5), rød = utsolgt, blå = restordre. Bruker emerald/amber
              som rene status-farger (ikke aka, fordi rødt er reservert for
              "negative" tilstander). */}
          <div className="mb-sp-3 flex items-center gap-sp-2">
            {product.stock_status === 'out_of_stock' ? (
              <>
                <span className="size-2 rounded-full bg-aka" aria-hidden />
                <span className="text-body-xs font-medium text-aka">Utsolgt</span>
              </>
            ) : product.stock_status === 'on_backorder' ? (
              <>
                <span className="size-2 rounded-full bg-ink-muted" aria-hidden />
                <span className="text-body-xs font-medium text-ink">
                  Forhåndsbestilling
                  {typeof product.stock_quantity === 'number' && product.stock_quantity > 0
                    ? ` — ${product.stock_quantity} stk på vei`
                    : ''}
                </span>
              </>
            ) : typeof product.stock_quantity === 'number' &&
              product.stock_quantity > 0 &&
              product.stock_quantity <= 5 ? (
              <>
                <span className="size-2 rounded-full bg-amber-500" aria-hidden />
                <span className="text-body-xs font-medium text-ink">
                  Kun {product.stock_quantity} {product.stock_quantity === 1 ? 'stk' : 'stk'} igjen
                </span>
              </>
            ) : (
              <>
                <span className="size-2 rounded-full bg-emerald-600" aria-hidden />
                <span className="text-body-xs font-medium text-ink">
                  På lager
                  {typeof product.stock_quantity === 'number' && product.stock_quantity > 0
                    ? ` (${product.stock_quantity} stk)`
                    : ''}
                </span>
              </>
            )}
          </div>

          {/* Trust — direkte under pris */}
          <div className="mb-sp-4 flex flex-col gap-1">
            {TRUST_ITEMS.map((item) => (
              <div key={item.text} className="flex items-center gap-sp-1">
                <TrustIcon />
                <span className="text-body-xs text-ink">{item.text}</span>
              </div>
            ))}
          </div>

          {/* Add-on card (Paper DHJ-1) — server-fetched upsell.
              Skjules helt hvis upsell ikke finnes / ikke er kjøpbart. */}
          {upsellProduct && (
            <UpsellCard
              upsellProduct={upsellProduct.product}
              upsellPath={upsellProduct.path}
            />
          )}

          {/* CTAs — AddToCartButton håndterer default (rød + ønskeliste) og
              aktiv (rød bar med stepper) — ønskeliste forsvinner i aktiv-state
              (Paper C — Aka pattern). */}
          <div className="mb-sp-4">
            <AddToCartButton
              product={product}
              productPath={productPath}
              categorySlug={product.primaryCategorySlug}
              wishlistItem={{
                id: product.id,
                slug: product.slug,
                href: `/${product.slug}`,
                name: product.name,
                brand: product.primaryCategorySlug ?? null,
                specLine: product.short_description ? stripHtml(product.short_description) : null,
                price: product.price,
                salePrice: product.sale_price ?? null,
                regularPrice: product.regular_price ?? null,
                stockStatus: (product.stock_status ?? 'in_stock') as 'in_stock' | 'out_of_stock' | 'on_backorder',
                image: images[0] ?? null,
                addedAt: '',
              }}
            />
          </div>


          {/* Betalingsmetoder */}
          <div className="flex flex-wrap items-center gap-sp-2 border-t border-divider pt-sp-3">
            <VisaLogo />
            <MastercardLogo />
            <AmexLogo />
            <VippsLogo />
            <KlarnaLogo />
          </div>
        </div>
      </div>

      {/* ================================================================
          2. LEVERANDØR (Paper DJ3-1)
          Desktop: 560px dark image + flex-1 text (py-56 px-64)
          Mobil: full-width image (240px) + text below (py-24 px-20)
          ================================================================ */}
      {brand && (
        <div className="flex flex-col border-b border-divider lg:flex-row">

          {/* Mørkt bilde med leverandør-caption — innholdet kommer fra
              brand-tabellen, satt i WP-admin under Produkter → Brands. */}
          <div
            className="relative flex min-h-[240px] flex-col justify-end p-sp-4 lg:min-h-[480px] lg:w-[65%] lg:shrink-0 lg:p-8"
            style={{
              background: brand.heroImageUrl
                ? `linear-gradient(160deg, rgba(0,0,0,0.55), rgba(0,0,0,0.75)), url(${brand.heroImageUrl}) center/cover no-repeat`
                : 'linear-gradient(160deg, #3a2a1a 0%, #1a1008 60%, #2a1e10 100%)',
            }}
          >
            <div className="relative">
              <span
                style={{ fontSize: 'var(--text-label)', letterSpacing: '0.12em', lineHeight: '12px' }}
                className="mb-1.5 block font-bold uppercase text-white/50"
              >
                Leverandør
              </span>
              <p
                className="font-bold text-white"
                style={{ fontSize: '22px', letterSpacing: '-0.01em', lineHeight: '120%' }}
              >
                {brand.name}
              </p>
              {brand.region && (
                <p className="text-body-xs text-white/70">{brand.region}</p>
              )}
            </div>
          </div>

          {/* Leverandør-tekst. Hentes fra brands.description i Supabase,
              som speiler product_brand → description i Woo. Hvis brandet
              har stats (skn_brand_stats), rendres de under teksten. */}
          <div className="flex flex-col justify-center px-sp-3 py-sp-6 md:px-sp-7 lg:py-14 lg:px-16">
            <SectionLabel accent>Om leverandøren</SectionLabel>
            <h2
              className="mt-3 font-bold text-ink"
              style={{ fontSize: '26px', letterSpacing: '-0.02em', lineHeight: '120%' }}
            >
              <a
                href={`/merkevarer/${brand.slug}`}
                className="hover:underline"
              >
                {brand.name}
              </a>
            </h2>
            {brand.description ? (
              <div
                className="product-description mt-5"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(brand.description) }}
              />
            ) : (
              <p className="mt-5 text-body-md text-ink-muted" style={{ lineHeight: '175%' }}>
                Mer informasjon om {brand.name} kommer.
              </p>
            )}
            {brand.stats && brand.stats.length > 0 && (
              <div className="mt-9 flex flex-wrap gap-12">
                {brand.stats.map((stat) => (
                  <div key={stat.label} className="flex flex-col gap-1">
                    <span
                      className="font-bold text-ink"
                      style={{ fontSize: '32px', letterSpacing: '-0.03em', lineHeight: '100%' }}
                    >
                      {stat.num}
                    </span>
                    <span
                      style={{ fontSize: 'var(--text-label)', letterSpacing: '0.08em' }}
                      className="font-bold uppercase text-ink-muted"
                    >
                      {stat.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================
          3. BESKRIVELSE (Paper DJR-1)
          bg-canvas, py-72 px-64, centered max-w-800
          ================================================================ */}
      {product.description && (
        <div className="border-b border-divider bg-canvas px-sp-3 py-14 md:px-sp-7 lg:px-16 lg:py-[72px]">
          <div className="mx-auto w-full max-w-[800px]">
            <SectionLabel accent>Om produktet</SectionLabel>

            {/* Ekte WooCommerce-beskrivelse med sanitert HTML.
                "Om leverandøren" hentes nå fra product_brand i Woo (se
                seksjon over) — beskrivelsen rendres som-er. Hvis et produkt
                fortsatt har `<h4>Om smeden</h4>`-blokk inline, kan den ryddes
                opp i Woo over tid. */}
            <div
              className="product-description mt-5"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(product.description) }}
            />
          </div>
        </div>
      )}

      {/* ================================================================
          4. SPESIFIKASJONER — kun hvis produktet har attributter
          ================================================================ */}
      {specs.length > 0 && <div className="border-b border-divider bg-surface px-sp-3 py-14 md:px-sp-7 lg:px-16 lg:py-[72px]">
        <div className="flex flex-col gap-sp-6 lg:flex-row lg:gap-16">

          {/* Venstre sidebar (Paper DLA-1: 240px shrink-0) */}
          <div className="lg:w-60 lg:shrink-0 lg:pt-1">
            <SectionLabel accent>Spesifikasjoner</SectionLabel>
            <h2 className="mt-2.5 font-bold text-ink" style={{ fontSize: '22px', letterSpacing: '-0.02em', lineHeight: '125%' }}>
              Tekniske detaljer
            </h2>
            <p className="mt-sp-2 text-body-xs text-ink-muted">
              Nøyaktige mål og egenskaper slik kniven forlater smia.
            </p>
          </div>

          {/* Tabell (Paper DLE-1: flex-1, border, rounded-1, overflow-clip) */}
          <div className="flex-1 overflow-hidden rounded-1 border border-divider">
            {/* Header-rad (Paper DLF-1: bg-canvas, py-12 px-24) */}
            <div className="flex border-b border-divider bg-canvas px-sp-4 py-3">
              <span className="flex-1 text-label font-bold uppercase text-ink-muted">Egenskap</span>
              <span className="flex-1 text-label font-bold uppercase text-ink-muted">Verdi</span>
            </div>
            {specs.map((row, i) => (
              <div
                key={row.key}
                className={[
                  'flex px-sp-4 py-3.5 border-b',
                  i < specs.length - 1 ? 'border-canvas' : 'border-transparent',
                ].join(' ')}
              >
                <span className="flex-1 text-body-sm text-ink-muted">{row.key}</span>
                <span className="flex-1 text-body-sm font-bold text-ink">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>}

      {/* ================================================================
          5. OMTALER — kun hvis rating_count > 0 og vi har anmeldelser
          ================================================================ */}
      {/* Vises hvis produktet har ratings — review-kort vises kun hvis hentet fra Woo */}
      {hasRating && (() => {
        // Bygg stjerne-fordeling fra ekte reviews
        const starCounts = [5, 4, 3, 2, 1].map((s) => ({
          stars: s,
          count: reviews.filter((r) => r.rating === s).length,
        }));
        const totalReviews = reviews.length;

        return (
        <div className="border-b border-divider bg-canvas px-sp-3 py-14 md:px-sp-7 lg:px-16 lg:py-[72px]">

          {/* Header-rad */}
          <div className="mb-12 flex items-baseline justify-between">
            <div>
              <SectionLabel>Omtaler</SectionLabel>
              <h2 className="mt-sp-2 font-bold text-ink" style={{ fontSize: '26px', letterSpacing: '-0.02em', lineHeight: '32px' }}>
                Hva kundene sier
              </h2>
            </div>
            <Button variant="primary" size="sm">
              Skriv omtale
            </Button>
          </div>

          {/* Rating-oversikt */}
          <div className="mb-12 flex flex-col gap-16 border-b border-divider pb-12 md:flex-row">
            <div className="flex shrink-0 flex-col items-center justify-center gap-sp-2 md:w-[200px]">
              <span className="font-bold text-ink" style={{ fontSize: '72px', letterSpacing: '-0.04em', lineHeight: '100%' }}>
                {ratingValue.toFixed(1)}
              </span>
              <StarRating value={ratingValue} size={20} />
              <span className="text-body-xs text-ink-muted">{ratingCount} omtale{ratingCount !== 1 ? 'r' : ''}</span>
            </div>

            {/* Stjerne-fordeling fra ekte data */}
            <div className="flex flex-1 flex-col justify-center gap-2.5">
              {starCounts.map(({ stars, count }) => (
                <div key={stars} className="flex items-center gap-sp-3">
                  <span className="w-8 shrink-0 text-body-xs text-ink-muted">{stars} ★</span>
                  <div className="h-1.5 flex-1 rounded-full bg-divider">
                    <div
                      className="h-full rounded-full bg-ink"
                      style={{ width: `${totalReviews > 0 ? (count / totalReviews) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right text-body-xs text-ink-muted">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Omtale-kort — ekte Woo-anmeldelser */}
          <div className="flex flex-col gap-sp-4 lg:flex-row lg:flex-wrap lg:gap-6">
            {reviews.slice(0, 6).map((review) => (
              <div key={review.id} className="flex flex-col rounded-1 bg-surface p-7 lg:w-[calc(33.333%-1rem)]">
                <div className="flex items-center justify-between">
                  <StarRating value={review.rating} size={14} />
                  <span className="text-muted-sm text-ink-muted">{formatReviewDate(review.date_created)}</span>
                </div>
                <p className="mt-sp-2 flex-1 text-body-xs text-ink" style={{ lineHeight: '165%' }}>
                  {stripReviewHtml(review.review)}
                </p>
                <div className="mt-sp-3 flex items-center gap-sp-2">
                  <div className="flex size-7 items-center justify-center rounded-full bg-divider">
                    <span className="text-label font-bold text-ink-muted">
                      {review.reviewer.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-body-xs font-bold text-ink">{review.reviewer}</span>
                  {review.verified && (
                    <span className="text-label text-ink-muted">· Verifisert kjøp</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* "Vis alle"-lenke — kun hvis det finnes flere enn vi viser */}
          {ratingCount > 4 && (
            <div className="mt-8 flex justify-center">
              <button className="inline-flex items-center gap-sp-2 rounded-1 border border-divider bg-surface px-5 py-2.5 text-body-xs font-medium text-ink transition-colors hover:bg-surface-hover">
                Vis alle {ratingCount} omtaler
              </button>
            </div>
          )}
        </div>
        );
      })()}

      {/* ================================================================
          6. RELATERTE PRODUKTER (Paper DW1-1)
          Bruker samme ProductGrid som kategori-sidene — én komponent for
          alle produktlistinger. Dataene kommer fra `relatedProducts`-prop'en
          (server-fetched i app/[...slug]/page.tsx). I dag plukker vi fra
          første kategori produktet ligger i; når vi har proper related-logic
          (samme brand, prisband, frequently-bought-together) byttes kun
          fetchen — komponenten her står som-er.
          ================================================================ */}
      {relatedProducts.length > 0 && (
        <div className="bg-canvas px-sp-3 pb-20 pt-14 md:px-sp-7 lg:px-16 lg:pb-20 lg:pt-16">

          <div className="mb-8 flex items-baseline justify-between">
            <div>
              <SectionLabel>Lignende produkter</SectionLabel>
              <h2
                className="mt-1.5 font-bold text-ink"
                style={{ fontSize: '24px', letterSpacing: '-0.02em', lineHeight: '30px' }}
              >
                Du vil kanskje også like
              </h2>
            </div>
            {product.primaryCategoryPath && (
              <Link
                href={`/${product.primaryCategoryPath}`}
                className="flex items-center gap-1 text-body-xs font-medium text-ink hover:text-aka"
              >
                Se alle <span aria-hidden>→</span>
              </Link>
            )}
          </div>

          <ProductGrid
            products={relatedProducts}
            listId={`related:${product.slug}`}
          />
        </div>
      )}

    </div>
  );
}
