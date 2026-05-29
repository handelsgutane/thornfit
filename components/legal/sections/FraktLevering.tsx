/**
 * Frakt og levering (seksjon 04) — Paper 7EY-0 (desktop) + 7PC-0 (mobile-variant).
 *
 * Desktop: 3-kolonne tabell (Fraktalternativ / Leveringstid / Pris) via
 * `grid-cols-4` med col-span-2 på navnekolonnen for 2:1:1-ratio uten
 * arbitrary flex-verdier. "Gratis"-prisene bruker midori (success green)
 * som tekstfarge — samme rolle som senere i checkout.
 *
 * Mobil (compact): kondensert liste der leveringstid + sub-description
 * slås sammen til én linje under navn. Gratis-frakt-terskelen (siste rad)
 * er highlightet med pale midori-bakgrunn som upsell-signal.
 */

import type { Density } from './types';

interface ShippingOption {
  name: string;
  description: string;
  deliveryTime: string;
  price: string;
  priceFree?: boolean;
  highlight?: boolean;
}

const OPTIONS: ShippingOption[] = [
  {
    name: 'Posten Servicepakke',
    description: 'Levering til postkasse eller pakkeboks',
    deliveryTime: '1–3 virkedager',
    price: '149 kr',
  },
  {
    name: 'Posten Ekspress',
    description: 'Levering til døren, prioritert forsendelse',
    deliveryTime: 'Neste virkedag',
    price: '249 kr',
  },
  {
    name: 'Hent på Bryn — Oslo',
    description: 'Brynsveien 3, 0667 Oslo · etter avtale',
    deliveryTime: 'Samme dag',
    price: 'Gratis',
    priceFree: true,
  },
  {
    name: 'Gratis frakt over 1 500 kr',
    description: 'Posten Servicepakke · 1–3 virkedager',
    deliveryTime: '1–3 virkedager',
    price: 'Gratis',
    priceFree: true,
    highlight: true,
  },
];

const FOOTNOTE =
  'Ordrer lagt inn på hverdager innen kl. 14:00 sendes samme dag. Vi leverer til hele Norge. For Svalbard og Jan Mayen kan det påløpe tilleggsfrakt — ta kontakt for pris.';

const FOOTNOTE_MOBILE =
  'Ordrer lagt inn hverdager innen kl. 14:00 sendes samme dag. Vi leverer til hele Norge. For Svalbard og Jan Mayen kan det påløpe tilleggsfrakt.';

export function FraktLevering({ density }: { density: Density }) {
  if (density === 'full') {
    return (
      <div className="flex flex-col gap-sp-4">
        <div className="flex flex-col overflow-clip rounded-1 border border-divider bg-surface">
          <div className="grid grid-cols-4 gap-sp-3 bg-canvas px-sp-4 py-sp-2">
            <div className="col-span-2 text-label font-bold uppercase text-ink-muted">
              Fraktalternativ
            </div>
            <div className="text-center text-label font-bold uppercase text-ink-muted">
              Leveringstid
            </div>
            <div className="text-right text-label font-bold uppercase text-ink-muted">
              Pris
            </div>
          </div>
          {OPTIONS.map((opt, idx) => (
            <div
              key={opt.name}
              className={[
                'grid grid-cols-4 items-center gap-sp-3 px-sp-4 py-sp-3',
                idx < OPTIONS.length - 1 ? 'border-b border-canvas' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="col-span-2 flex flex-col gap-sp-1">
                <div className="text-body-sm font-bold text-ink">
                  {opt.name}
                </div>
                <div className="text-body-xs text-ink-muted">
                  {opt.description}
                </div>
              </div>
              <div className="text-center text-body-sm text-ink">
                {opt.deliveryTime}
              </div>
              <div
                className={[
                  'text-right text-body-sm font-bold',
                  opt.priceFree ? 'text-midori' : 'text-ink',
                ].join(' ')}
              >
                {opt.price}
              </div>
            </div>
          ))}
        </div>
        <p className="text-body-sm leading-relaxed text-ink-muted">{FOOTNOTE}</p>
      </div>
    );
  }

  // compact — mobile
  return (
    <div className="flex flex-col gap-sp-4">
      <div className="flex flex-col overflow-clip rounded-1 border border-divider">
        {OPTIONS.map((opt, idx) => {
          const isLast = idx === OPTIONS.length - 1;
          return (
            <div
              key={opt.name}
              className={[
                'flex items-center justify-between px-sp-3 py-sp-3',
                opt.highlight ? 'bg-promo-active-bg' : 'bg-surface',
                !isLast ? 'border-b border-canvas' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="flex min-w-0 flex-col gap-sp-1">
                <div
                  className={[
                    'text-body-sm font-bold',
                    opt.highlight ? 'text-midori' : 'text-ink',
                  ].join(' ')}
                >
                  {opt.name}
                </div>
                <div className="text-body-xs text-ink-muted">
                  {opt.deliveryTime} · {opt.description}
                </div>
              </div>
              <div
                className={[
                  'ml-sp-3 shrink-0 text-body-sm font-bold',
                  opt.priceFree ? 'text-midori' : 'text-ink',
                ].join(' ')}
              >
                {opt.price}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-body-xs leading-relaxed text-ink-muted">
        {FOOTNOTE_MOBILE}
      </p>
    </div>
  );
}
