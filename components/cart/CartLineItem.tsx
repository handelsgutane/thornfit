'use client';

/**
 * CartLineItem — én rad i handlekurven (Paper 4X5-0 desktop, 67O-0 mobile).
 *
 * **Kort-struktur (identisk mobile/desktop, kun padding-skala skifter):**
 *   1. **Top-row**: thumb + info-kolonne
 *      - Info-kolonne har en header-rad med brand (uppercase) til venstre og
 *        "Fjern" til høyre. Dette matcher Paper 67S-0 (mobile) og 4XA-0-området
 *        (desktop) hvor remove-knappen ligger inni linjen — ikke under.
 *      - Under header: produktnavn, deretter spec-linje ("210mm · VG10 ·
 *        SKU: …"), deretter optional mengderabatt-badge.
 *   2. **Bottom-row**: stepper venstre, pris høyre.
 *      - Pris-blokken viser unit price (rødt hvis salg) med evt. strikethrough
 *        regular inline. Under: "kr N totalt" i mindre label.
 *
 * **Hvorfor rød unit price ved salg?** Paper 68C-0/69O-0 bruker aka-tokenet
 * for sale-pris; vi speiler det fordi det matcher ProductGrid-kortene og det
 * visuelt ankrer rabatten.
 *
 * **Mengderabatt-badge:** For nå er dette et statisk placeholder-badge som
 * slår på når `onSale` er true (pending = amber "Mengderabatt: …" vs active
 * = grønn "… aktivert"). Ekte mengderabatt-engine er TODO; vi bygger markup
 * og tokens nå så det er enkelt å plugge inn senere.
 *
 * **Stepper-oppførsel:** min=0 så `−` kan fjerne linjen direkte (chef-
 * storefront-mønster). Ingen separat `Fjern`-knapp er nødvendig, men Paper
 * viser "Fjern" likevel som eksplisitt handling — vi beholder den.
 */

import Image from 'next/image';
import Link from 'next/link';
import { useTransition } from 'react';

import { removeFromCart, setQuantity } from '@/lib/cart/api';
import { formatNok } from '@/lib/cart/totals';
import type { CartItem } from '@/types/cart';

import { QuantityStepper } from './QuantityStepper';

export interface CartLineItemProps {
  item: CartItem;
  /**
   * Maks-verdi fra Supabase stock (`stock_quantity`). Her lar vi det være
   * `null` i MVP — lager-kontroll hentes fra Woo ved checkout, ikke her.
   */
  stockLimit?: number | null;
}

export function CartLineItem({ item, stockLimit = null }: CartLineItemProps) {
  const [, startTransition] = useTransition();

  const lineTotal = item.unitPrice * item.quantity;
  const onSale = item.regularPrice > item.unitPrice;

  // Kategori-label er derivert fra siste segment av categorySlug og titlecased.
  // Bevisst enkelt: å lagre en separat label på CartItem hadde krevd backfill
  // for eksisterende localStorage-stater. Slug → label-regelen matcher
  // kategori-chip-stilen på PDP (Paper 4XA-0-området over tittel).
  const categoryLabel = deriveCategoryLabel(item.categorySlug);

  // SKU ligger allerede embedded i `specLine` ("… · SKU: KN-21C-VG10") fra
  // `buildSpecLineForProduct`. Vi løfter den til egen linje for bedre lesbarhet
  // (ofte det eneste stabile ID-et for kundesupport), og stripper SKU-suffixet
  // fra spec-linjen så vi ikke dobbelt-viser den.
  const specWithoutSku = item.specLine
    ? stripSkuFromSpec(item.specLine, item.sku)
    : null;

  const handleQuantity = (next: number) => {
    startTransition(() => {
      if (next <= 0) {
        removeFromCart(item.key);
      } else {
        setQuantity(item.key, next);
      }
    });
  };

  const handleRemove = () => {
    startTransition(() => {
      removeFromCart(item.key);
    });
  };

  const productHref = `/${item.productSlug}`;

  // Paper 67O-0 (mobile) / 4X5-0 (desktop): kort med border + radius.
  //   • Mobil: INGEN outer padding. Inner sections har egne paddings —
  //     top 14/14/12/14 (67P-0), bottom 10/14/14/14 (681-0) med border-top
  //     sakai-light som divider.
  //   • Desktop: OUTER card-padding 20/20 (4X5-0). Top-row har gap 16 mellom
  //     thumb og info uten egen padding (4X6-0). Bottom-row har mt 16 + pt 16
  //     border-top sakai-light, justify-end + gap 24 (4XP-0).
  // Implementert via `md:p-5` på outer + `md:p-0` på inner-paddings, så samme
  // markup serverer begge flatene uten duplisering.
  return (
    <li className="flex flex-col overflow-hidden rounded-sm border border-divider bg-surface md:p-5" /* paper-exact: 4X5-0 (desktop outer padding 20) */>
      {/* Top row: thumb + info — Paper 67P-0 (mobile 14/14/12/14, gap 12) / 4X6-0 (desktop gap 16, ingen egen padding). */}
      <div className="flex gap-3 px-3.5 pt-3.5 pb-3 md:gap-sp-3 md:p-0" /* paper-exact: 4X6-0 */>
        <Link
          href={productHref}
          className="relative block h-(--size-cart-thumb-sm) w-(--size-cart-thumb-sm) flex-shrink-0 overflow-hidden border border-divider bg-surface-muted md:h-(--size-cart-thumb) md:w-(--size-cart-thumb)" /* paper-exact: 67Q-0 (72 mobile) / 4X7-0 (88 desktop) */
          aria-label={item.name}
        >
          {item.imageUrl ? (
            <Image
              src={item.imageUrl}
              alt={item.name}
              fill
              sizes="(min-width: 768px) 88px, 72px"
              className="object-cover"
            />
          ) : (
            <div
              className="flex h-full flex-col items-center justify-center gap-sp-1 text-ink-muted"
              aria-hidden
            >
              <PlaceholderKnifeIcon />
              <span className="text-label normal-case tracking-normal">
                Ingen foto
              </span>
            </div>
          )}
        </Link>

        <div className="flex min-w-0 flex-1 flex-col gap-sp-1">
          {/* Header-rad: kategori-chip venstre, Fjern høyre — Paper 67S-0.
              Kategori over brand gir breadcrumb-følelse; når produktet ikke har
              eksplisitt kategori/merke holder vi radens høyde stabilt med \u00A0. */}
          <div className="flex items-start justify-between gap-sp-2">
            {categoryLabel ? (
              // Kategori-label vises som statisk tekst, ikke lenke: CartItem
              // lagrer kun terminal-slug (`categorySlug`), men kategori-URLer
              // er nested (`/foreldre/barn`) så en lenke hit ville ofte peke
              // feil sted. Lenke-tilgang krever at vi utvider CartItem-shapen.
              <span className="truncate text-label uppercase text-ink-muted">
                {categoryLabel}
              </span>
            ) : item.brand ? (
              <span className="truncate text-label uppercase text-ink-muted">
                {item.brand}
              </span>
            ) : (
              <span aria-hidden className="text-label">
                {'\u00A0'}
              </span>
            )}
            <button
              type="button"
              onClick={handleRemove}
              className="flex-shrink-0 text-muted-sm text-ink-muted transition-colors hover:text-aka focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-1"
            >
              Fjern
            </button>
          </div>

          {/* Brand på egen linje når kategori er synlig, så begge leses */}
          {categoryLabel && item.brand && (
            <span className="truncate text-muted-sm font-medium uppercase text-ink-muted">
              {item.brand}
            </span>
          )}

          <Link
            href={productHref}
            className="font-bold text-ink transition-colors hover:text-aka text-[13px] leading-[17px] md:text-h4" /* paper-exact: 67V-0 (mobile 13/17), md+ text-h4 — bumpet +1 size opp fra text-body. Tailwind-utilities (ikke inline-style) så `md:`-override slår inn. */
          >
            {item.name}
          </Link>

          {specWithoutSku && (
            <p className="truncate text-ink-muted md:text-muted-sm" style={{ fontSize: '11px', lineHeight: '14px' }} /* paper-exact: 67W-0 (mobile 11/14) */>
              {specWithoutSku}
            </p>
          )}

          {item.sku && (
            <p className="text-label tabular-nums text-ink-muted normal-case tracking-normal">
              SKU: {item.sku}
            </p>
          )}

          {/* Unit-pris — Paper 4X5-0 plasserer unit-price i info-kolonnen rett
              under SKU. "kr N (sale) · kr N (strike) · / stk". Paper bruker
              tekst-body for unit-tallet, body-xs for strike og muted-sm for
              "/ stk"-suffiks. onSale gjør unit-tallet rødt (aka) — matcher
              ProductGrid/PDP-konvensjonen for salgspris. */}
          {item.unitPrice > 0 && (
            <p className="mt-sp-1 flex items-baseline gap-sp-2 text-body font-bold tabular-nums leading-5">
              <span className={onSale ? 'text-aka' : 'text-ink'}>
                {formatNok(item.unitPrice)}
              </span>
              {onSale && (
                <span className="text-body-xs font-normal text-ink-muted line-through">
                  {formatNok(item.regularPrice)}
                </span>
              )}
              <span className="text-muted-sm font-normal text-ink-muted">
                / stk
              </span>
            </p>
          )}

          {onSale && <MengdeRabattBadge state="active" />}
        </div>
      </div>

      {/* Bottom row: stepper + linje-total — Paper 681-0 (mobile) / 4XP-0
          (desktop). Border-top er sakai-light (canvas-tint).
            • Mobil: padding 10/14/14/14, justify-between (stepper venstre,
              pris høyre). Border-top canvas.
            • Desktop: mt 16, pt 16, justify-end, gap 24 — stepper + pris
              presses mot høyre kant av kortets indre 20px-padding-felt.
          Unit-prisen bor i info-kolonnen over, så bottom-raden viser
          linje-totalen (stk × unit-pris) som stor bold, med "inkl. MVA"
          som subtext (våre priser er lagret inkl. MVA, ADR-0005). */}
      <div className="flex items-center justify-between gap-sp-3 border-t border-canvas px-3.5 pt-2.5 pb-3.5 md:justify-end md:gap-sp-4 md:mt-sp-3 md:pt-sp-3 md:px-0 md:pb-0" /* paper-exact: 4XP-0 (desktop mt 16 pt 16 gap 24 justify-end) */>
        <QuantityStepper
          value={item.quantity}
          onChange={handleQuantity}
          min={0}
          max={stockLimit}
          productLabel={item.name}
        />
        <div className="text-right">
          {item.unitPrice > 0 ? (
            <>
              <p className="text-body font-bold tabular-nums leading-5 text-ink">
                {formatNok(lineTotal)}
              </p>
              <p className="text-label tabular-nums text-ink-muted normal-case tracking-normal">
                inkl. MVA
              </p>
            </>
          ) : (
            // Defensiv fallback: pris mangler (stale cart-state, eller Supabase-
            // data uten price). Vi viser tydelig status så brukeren ikke blir
            // overrasket i checkout, og logger kan fange radene for opprydding.
            <p className="text-body-xs text-ink-muted">Pris oppdateres…</p>
          )}
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Title-case terminal-slug til en lesbar label.
 *
 * Eksempel: "japanske-kokkekniver" → "Japanske kokkekniver".
 * Første bokstav kapitalisert, hyphens → space. Vi gjør ikke full
 * Proper-Case fordi norsk skrift bruker kun første bokstav stor (jf.
 * "Japanske kokkekniver", ikke "Japanske Kokkekniver").
 */
function deriveCategoryLabel(slug: string | null): string | null {
  if (!slug) return null;
  const normalized = slug.replace(/-/g, ' ').trim();
  if (!normalized) return null;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

/**
 * Fjern SKU-suffixet fra spec-line når vi rendrer SKU som egen linje.
 * Spec-linjer er formatert som "A · B · SKU: X" — vi strippe det siste
 * segmentet hvis det starter med "SKU:". Beholder øvrige segmenter intakt.
 */
function stripSkuFromSpec(spec: string, sku: string | null): string | null {
  if (!sku) return spec || null;
  const parts = spec.split(' · ').filter((p) => !p.startsWith('SKU:'));
  if (parts.length === 0) return null;
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Ikoner
// ---------------------------------------------------------------------------

/**
 * PlaceholderKnifeIcon — vises i thumbnail-boksen når `imageUrl` er null.
 * Enkel kniv-silhuett (blad + håndtak) som varemerker placeholderen som
 * skarpekniver-spesifikk i stedet for generisk "bilde mangler"-ikon.
 */
function PlaceholderKnifeIcon() {
  return (
    <svg
      aria-hidden
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      {/* Blad */}
      <path
        d="M3 16L18 7l2 3-15 9-2-3Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Håndtak */}
      <path
        d="M19 10l5 3-4 7-5-3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// MengdeRabattBadge — Paper 67X-0 (pending) / 699-0 (active)
// ---------------------------------------------------------------------------

/**
 * Pill-formet status-badge under produktnavn. To tilstander (foreløpig kun
 * statisk) — pending (amber) = rabatt tilgjengelig ved N+ stk, active (grønn)
 * = allerede aktivert for denne linjen.
 *
 * Markup + tokens er på plass så ekte mengderabatt-engine kan plugges inn
 * uten å røre layouten.
 */
function MengdeRabattBadge({ state }: { state: 'pending' | 'active' }) {
  if (state === 'active') {
    return (
      <span
        className="mt-sp-1 inline-flex w-fit items-center gap-sp-2 rounded-sm border bg-(--color-promo-active-bg) px-sp-2 py-[3px] text-label font-bold text-(--color-promo-active-fg) normal-case tracking-normal" /* paper-exact: 699-0 (promo badge — active) */
        style={{ borderColor: 'var(--color-promo-active-border)' }}
      >
        <CheckIcon />
        <span>−8% mengderabatt aktivert</span>
      </span>
    );
  }
  return (
    <span
      className="mt-sp-1 inline-flex w-fit items-center gap-sp-2 rounded-sm border bg-(--color-promo-pending-bg) px-sp-2 py-[3px] text-label font-bold text-(--color-promo-pending-fg) normal-case tracking-normal" /* paper-exact: 67X-0 (promo badge — pending) */
      style={{ borderColor: 'var(--color-promo-pending-border)' }}
    >
      <SparkIcon />
      <span>Mengderabatt: 3+ stk −8%</span>
    </span>
  );
}

function SparkIcon() {
  return (
    <svg
      aria-hidden
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M6 1L2 6h3l-1 3 4-5H5l1-3Z" fill="currentColor" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M1.5 5.5L4 8l5-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
