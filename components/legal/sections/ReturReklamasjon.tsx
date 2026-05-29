/**
 * Retur og reklamasjon (seksjon 03) — Paper 7E7-0 (desktop).
 *
 * To paragraffer + 3-step process-rad ("Kontakt oss → Returetikett → Refusjon").
 * Siste step-kortet bruker aka (FF3333) som bakgrunn for steg-nummeret — Paper
 * signaliserer "positive end-state" (refusjon fullført).
 *
 * På compact (mobil) rendres step-radene som numbered list i stedet for 3-col
 * kort-grid så de ikke klemmes på 358px.
 */

import type { Density } from './types';

interface ReturStep {
  n: number;
  title: string;
  description: string;
  /** Siste steget har rød bullet for å markere positivt endepunkt. */
  accent?: boolean;
}

const STEPS: ReturStep[] = [
  {
    n: 1,
    title: 'Kontakt oss',
    description: 'Send e-post med ordrenummer og beskrivelse',
  },
  {
    n: 2,
    title: 'Motta returetikett',
    description: 'Vi sender prepaid etikett innen 1 virkedag',
  },
  {
    n: 3,
    title: 'Refusjon',
    description: 'Refundert til original betalingsmåte innen 5 dager',
    accent: true,
  },
];

export function ReturReklamasjon({ density }: { density: Density }) {
  const isFull = density === 'full';

  return (
    <div className="flex flex-col gap-sp-4">
      <div className="flex flex-col gap-sp-2">
        <h3 className="text-body font-bold text-ink">3.1 Returbetingelser</h3>
        <p className="text-body leading-relaxed text-ink">
          {isFull
            ? 'Ubrukte varer i original emballasje kan returneres innen 14 dager fra mottak. Kniver som er tatt i bruk eller slipt kan ikke returneres av hygiene- og sikkerhetsmessige årsaker, med mindre de er mangelfulle. Kontakt oss på post@thornfit.no med ordrenummer og begrunnelse for å starte returen.'
            : 'Ubrukte varer i original emballasje kan returneres innen 14 dager. Brukte eller slipte kniver tas ikke tilbake av hygienegrunner. Kontakt post@thornfit.no med ordrenummer for å starte retur.'}
        </p>
      </div>

      <div className="flex flex-col gap-sp-2">
        <h3 className="text-body font-bold text-ink">
          3.2 Reklamasjon og mangel
        </h3>
        <p className="text-body leading-relaxed text-ink">
          {isFull
            ? 'Kjøpsloven gir deg rett til å reklamere på varer med fabrikasjonsfeil i inntil 2 år (5 år for varer ment å vare vesentlig lenger). Send bilder av feilen og din ordrebekreftelse til post@thornfit.no. Vi dekker returfrakten og tilbyr reparasjon, ombytting eller full refusjon.'
            : 'Reklamasjonsrett i inntil 2 år (5 år for varer som skal vare vesentlig lenger). Send bilder + ordrebekreftelse til post@thornfit.no. Vi dekker returfrakt og tilbyr reparasjon, ombytting eller full refusjon.'}
        </p>
      </div>

      {isFull ? (
        <div className="mt-sp-1 grid grid-cols-3 overflow-clip rounded-1 border border-divider">
          {STEPS.map((step, idx) => (
            <div
              key={step.n}
              className={[
                'flex flex-col items-center gap-sp-2 bg-surface p-sp-3 text-center',
                idx < STEPS.length - 1 ? 'border-r border-divider' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <StepBadge n={step.n} accent={step.accent} />
              <div className="text-body-xs font-bold text-ink">
                {step.title}
              </div>
              <p className="text-muted-sm leading-relaxed text-ink-muted">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <ol className="mt-sp-1 flex flex-col gap-sp-3 rounded-1 border border-divider bg-surface p-sp-3">
          {STEPS.map((step) => (
            <li key={step.n} className="flex items-start gap-sp-3">
              <StepBadge n={step.n} accent={step.accent} />
              <div className="flex min-w-0 flex-col gap-sp-1">
                <span className="text-body-sm font-bold text-ink">
                  {step.title}
                </span>
                <span className="text-body-sm leading-relaxed text-ink-muted">
                  {step.description}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function StepBadge({ n, accent }: { n: number; accent?: boolean }) {
  // Paper 7E7-0: alle step-badges er size-7 (28px) sirkler.
  // Step 3 bruker aka som bakgrunn; step 1-2 bruker kuro (surface-contrast).
  return (
    <div
      className={[
        'flex size-(--size-step-badge) shrink-0 items-center justify-center rounded-full text-muted-sm font-bold text-ink-inverse',
        accent ? 'bg-aka' : 'bg-surface-contrast',
      ].join(' ')}
    >
      {n}
    </div>
  );
}
