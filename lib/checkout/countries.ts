/**
 * Land vi sender til. Default = NO. Dropdown-rekkefølge er bevisst:
 * Norden først (vanligst), så Europa.
 *
 * NB: ADR-0005 sier "Kun Norge". Når Skarpekniver utvider til flere land,
 * må også: skattesats per land, valuta-konvertering hvis vi støtter EUR/SEK,
 * og Woo-shipping-zones per land. Foreløpig håndteres alle som NOK.
 */

export interface Country {
  code: string;
  name: string;
  /** Postnummer-format hint — brukes til input-validering. Mønster matcher
   *  trimmet input, f.eks. NO=4 siffer, SE=5 siffer, DK=4 siffer. */
  postalCodeFormat?: RegExp;
  postalCodeMaxLength?: number;
}

export const COUNTRIES: Country[] = [
  { code: 'NO', name: 'Norge', postalCodeFormat: /^\d{4}$/, postalCodeMaxLength: 4 },
  { code: 'SE', name: 'Sverige', postalCodeFormat: /^\d{3}\s?\d{2}$/, postalCodeMaxLength: 6 },
  { code: 'DK', name: 'Danmark', postalCodeFormat: /^\d{4}$/, postalCodeMaxLength: 4 },
  { code: 'FI', name: 'Finland', postalCodeFormat: /^\d{5}$/, postalCodeMaxLength: 5 },
  { code: 'IS', name: 'Island', postalCodeFormat: /^\d{3}$/, postalCodeMaxLength: 3 },
  { code: 'GB', name: 'Storbritannia', postalCodeMaxLength: 8 },
  { code: 'DE', name: 'Tyskland', postalCodeFormat: /^\d{5}$/, postalCodeMaxLength: 5 },
  { code: 'FR', name: 'Frankrike', postalCodeFormat: /^\d{5}$/, postalCodeMaxLength: 5 },
  { code: 'NL', name: 'Nederland', postalCodeMaxLength: 7 },
  { code: 'US', name: 'USA', postalCodeMaxLength: 10 },
];

export const DEFAULT_COUNTRY_CODE = 'NO';

export function getCountry(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code);
}
