/**
 * Kjøpsbetingelser (seksjon 01) — Paper 7D0-0 (desktop) + mobile-variant i 7NV-0.
 *
 * Fire sub-punkter (1.1–1.4). `density="full"` gir den lange desktop-copy-en;
 * `density="compact"` gir den forkortede mobile-versjonen Paper viser i
 * tab-innholdet. Felles struktur (overskrift + paragraf) — bare selve teksten
 * varierer, så vi holder alt i én fil og mapper på density.
 */

import type { Density } from './types';

interface SubSection {
  number: string;
  title: string;
  full: string;
  compact: string;
}

const SUBSECTIONS: SubSection[] = [
  {
    number: '1.1',
    title: 'Avtaleparter',
    full: 'Kjøper er den personen som foretar bestillingen. Selger er Handelsgutane AS, organisasjonsnummer 917 765 146, med forretningsadresse Brynsveien 3, 0667 Oslo. Avtalen inngås elektronisk ved at kjøper gjennomfører bestillingen og selger bekrefter ordren per e-post.',
    compact:
      'Selger er Handelsgutane AS, org.nr. 917 765 146, Brynsveien 3, 0667 Oslo. Avtalen inngås elektronisk ved gjennomført bestilling og bekreftet per e-post.',
  },
  {
    number: '1.2',
    title: 'Bestilling og betaling',
    full: 'Alle priser er oppgitt inklusiv merverdiavgift med mindre annet er spesifisert. Vi aksepterer Visa, Mastercard, Vipps og faktura (30 dager netto for godkjente bedriftskunder). Betaling trekkes ved forsendelse. Vi benytter SSL-kryptering og er PCI DSS-sertifisert.',
    compact:
      'Priser inkl. mva. Vi aksepterer Visa, Mastercard, Vipps og faktura (30 dager for bedriftskunder). Betaling trekkes ved forsendelse. Vi benytter SSL-kryptering og er PCI DSS-sertifisert.',
  },
  {
    number: '1.3',
    title: 'Angrerett',
    full: 'I henhold til angrerettloven har du som privatperson 14 dagers angrerett fra du mottar varen. Send skriftlig melding til post@thornfit.no eller bruk angrefskjemaet vedlagt i pakken. Varen må returneres i original emballasje og ubrukt stand. Frakt ved retur bekostes av kjøper med mindre varen er feil eller mangelfull.',
    compact:
      '14 dagers angrerett fra mottak. Varen returneres ubrukt i original emballasje. Send melding til post@thornfit.no. Returfrakt dekkes av kjøper med mindre varen er mangelfull.',
  },
  {
    number: '1.4',
    title: 'Priser og tilgjengelighet',
    full: 'Vi forbeholder oss retten til å endre priser uten forhåndsvarsel. Hvis en vare er feilpriset vil vi kontakte deg før ordren behandles. Tilgjengelighet oppdateres i sanntid, men kan i sjeldne tilfeller avvike. Dersom en vare er utsolgt etter at bestillingen er lagt inn, vil vi gi deg beskjed og tilby full refusjon eller alternativ løsning.',
    compact:
      'Vi forbeholder oss retten til å endre priser uten forhåndsvarsel. Dersom en vare er utsolgt etter bestilling, kontakter vi deg og tilbyr full refusjon eller alternativ løsning.',
  },
];

export function Kjopsbetingelser({ density }: { density: Density }) {
  return (
    <div className="flex flex-col gap-sp-4">
      {SUBSECTIONS.map((sub) => (
        <div key={sub.number} className="flex flex-col gap-sp-2">
          <h3 className="text-body font-bold text-ink">
            {sub.number} {sub.title}
          </h3>
          <p className="text-body leading-relaxed text-ink">
            {density === 'full' ? sub.full : sub.compact}
          </p>
        </div>
      ))}
    </div>
  );
}
