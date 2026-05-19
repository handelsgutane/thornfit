/**
 * Informasjonskapsler (seksjon 05) — Paper 7FW-0.
 *
 * Kort intro + tre cookie-kategori-kort med fargekodet status-dot:
 *   · midori  = alltid på (Nødvendige)
 *   · kogane  = opt-out analytiske
 *   · haiiro  = krever samtykke / markedsføring
 *
 * Samme struktur desktop + mobil — ingen density-forgrening her; kortene
 * klarer seg på begge viewports.
 */

import type { Density } from './types';

interface CookieType {
  title: string;
  description: string;
  /** Token-navn for dot-fargen (uten `bg-`-prefix). */
  dotColor: 'midori' | 'kogane' | 'ink-muted';
}

const TYPES: CookieType[] = [
  {
    title: 'Nødvendige',
    description:
      'Påkrevd for grunnleggende funksjonalitet: innlogging, handlekurv og betalingsflyt. Kan ikke deaktiveres.',
    dotColor: 'midori',
  },
  {
    title: 'Analytiske',
    description:
      'Anonymisert statistikk via Plausible Analytics. Ingen persondata, ingen deling med tredjeparter. Kan deaktiveres.',
    dotColor: 'kogane',
  },
  {
    title: 'Markedsføring',
    description:
      'Brukes til å vise relevante annonser. Krever aktivt samtykke. Kan deaktiveres når som helst i cookiebanneret.',
    dotColor: 'ink-muted',
  },
];

const DOT_CLASS: Record<CookieType['dotColor'], string> = {
  midori: 'bg-midori',
  kogane: 'bg-kogane',
  'ink-muted': 'bg-ink-muted',
};

export function Informasjonskapsler({ density }: { density: Density }) {
  const isFull = density === 'full';

  return (
    <div className="flex flex-col gap-sp-4">
      <p className="text-body leading-relaxed text-ink">
        {isFull
          ? 'Vi bruker informasjonskapsler (cookies) for å gi deg en bedre handleopplevelse, huske innstillinger og analysere trafikk. Du kan styre samtykket ditt via cookiebanneret eller nettleserinnstillingene dine.'
          : 'Vi bruker cookies for bedre handleopplevelse, innstillinger og trafikkanalyse. Styr samtykket via cookiebanneret eller nettleser-innstillingene.'}
      </p>

      <div className="flex flex-col gap-sp-2">
        {TYPES.map((t) => (
          <div
            key={t.title}
            className="flex items-start gap-sp-3 rounded-1 border border-divider bg-surface px-sp-3 py-sp-3"
          >
            <div
              className={[
                'mt-sp-1 size-(--size-cookie-dot) shrink-0 rounded-full',
                DOT_CLASS[t.dotColor],
              ].join(' ')}
              aria-hidden
            />
            <div className="flex min-w-0 flex-col gap-sp-1">
              <div className="text-body-sm font-bold text-ink">{t.title}</div>
              <p className="text-body-xs leading-relaxed text-ink-muted">
                {t.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
