/**
 * Personvernerklæring (seksjon 02) — Paper 7DH-0 (desktop).
 *
 * Tre sub-punkter. 2.3 inneholder GDPR-rettigheter som vises som 2×2-kort-grid
 * på desktop. På mobil (compact density) kondenseres dette til en bullet-liste
 * med samme fire rettigheter siden kort-griddet ikke får plass ved 358px bred
 * content-kolonne.
 */

import type { Density } from './types';

interface GdprRight {
  title: string;
  description: string;
}

const GDPR_RIGHTS: GdprRight[] = [
  {
    title: 'Innsyn',
    description:
      'Du kan når som helst be om en kopi av alle opplysningene vi har om deg.',
  },
  {
    title: 'Retting',
    description:
      'Feil opplysninger kan korrigeres via profilsiden eller ved å kontakte oss.',
  },
  {
    title: 'Sletting',
    description:
      'Du kan slette kontoen din og all tilknyttet data fra Innstillinger-siden.',
  },
  {
    title: 'Portabilitet',
    description:
      'Last ned alle dine data i maskinlesbart format fra Innstillinger.',
  },
];

export function Personvernerklaering({ density }: { density: Density }) {
  const isFull = density === 'full';

  return (
    <div className="flex flex-col gap-sp-4">
      <div className="flex flex-col gap-sp-2">
        <h3 className="text-body font-bold text-ink">
          2.1 Hvilke opplysninger vi samler inn
        </h3>
        <p className="text-body leading-relaxed text-ink">
          {isFull
            ? 'Vi samler inn navn, e-postadresse, leveringsadresse, telefonnummer og betalingsinformasjon ved bestilling. Vi lagrer også informasjon om dine ordrer og ønskelister. Anonymisert surfeatferd (sidevisninger, klikk) samles inn via informasjonskapsler for å forbedre nettstedet.'
            : 'Vi samler inn navn, e-post, adresse, telefon og betalingsinfo ved bestilling, samt ordrer og ønskelister. Anonymisert surfeatferd samles inn via cookies.'}
        </p>
      </div>

      <div className="flex flex-col gap-sp-2">
        <h3 className="text-body font-bold text-ink">
          2.2 Slik bruker vi opplysningene
        </h3>
        <p className="text-body leading-relaxed text-ink">
          {isFull
            ? 'Personopplysningene benyttes utelukkende til å behandle og levere din ordre, sende ordrebekreftelse og fraktvarsler, og gi kundestøtte. Med ditt samtykke sender vi nyhetsbrev og tilbud. Vi selger eller deler aldri dine personopplysninger med tredjeparter for markedsformål.'
            : 'Vi bruker dataene kun til å behandle ordrer, sende ordrebekreftelse/fraktvarsler og gi kundestøtte. Nyhetsbrev krever samtykke. Vi selger aldri data til tredjeparter.'}
        </p>
      </div>

      <div className="flex flex-col gap-sp-2">
        <h3 className="text-body font-bold text-ink">
          2.3 Dine rettigheter (GDPR)
        </h3>

        {isFull ? (
          <div className="mt-sp-1 grid grid-cols-2 gap-sp-3">
            {GDPR_RIGHTS.map((r) => (
              <div
                key={r.title}
                className="flex flex-col gap-sp-1 rounded-1 border border-divider bg-surface p-sp-3"
              >
                <div className="text-body-xs font-bold text-ink">{r.title}</div>
                <p className="text-body-xs leading-relaxed text-ink-muted">
                  {r.description}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <ul className="mt-sp-1 flex flex-col gap-sp-2">
            {GDPR_RIGHTS.map((r) => (
              <li key={r.title} className="flex flex-col gap-sp-1">
                <span className="text-body-sm font-bold text-ink">
                  {r.title}
                </span>
                <span className="text-body-sm leading-relaxed text-ink-muted">
                  {r.description}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
