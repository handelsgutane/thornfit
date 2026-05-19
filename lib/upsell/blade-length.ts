/**
 * Knivbladlengde → matchende knivbeskytter-SKU.
 *
 * Vi har 5 knivbeskytter-størrelser fra leverandøren. Hver kniv har en
 * attributt `Knivbladlengde` (cm) i Woo. Resolveren plukker første range
 * der bladlengden faller innenfor [minCm, maxCm].
 *
 * Mapping (per leverandør 2026-05):
 *   HTD01-095   →  6-11 cm
 *   HTD01-150   → 12-15 cm
 *   HTD01-200   → 16-19 cm
 *   HTD01-250   → 20-21 cm
 *   HTD01-300   → 22+ cm  (dekker 24-25, 27, 30 + ev. gap-størrelser)
 *
 * Hvis bladlengden er < 6 cm eller produktet mangler attributtet,
 * returneres `null` og resolveren faller gjennom til kategori-default.
 *
 * Attributt-navnet i WP kan variere — vi støtter flere slug-/navn-varianter
 * for å være robust mot fremtidige omdøpinger.
 */

const KNIVBESKYTTER_RANGES: ReadonlyArray<{
  readonly minCm: number;
  readonly maxCm: number;
  readonly sku: string;
}> = [
  { minCm: 6, maxCm: 11, sku: 'HTD01-095' },
  { minCm: 12, maxCm: 15, sku: 'HTD01-150' },
  { minCm: 16, maxCm: 19, sku: 'HTD01-200' },
  { minCm: 20, maxCm: 21, sku: 'HTD01-250' },
  { minCm: 22, maxCm: 60, sku: 'HTD01-300' },
];

/** Slug-varianter for `pa_*`-taksonomien. */
const KNIVBLADLENGDE_SLUGS: ReadonlyArray<string> = [
  'pa_knivbladlengde',
  'pa_bladlengde',
];

/** Display-navn-varianter (case-insensitive). */
const KNIVBLADLENGDE_NAMES: ReadonlyArray<string> = [
  'knivbladlengde',
  'knivbladlengde (cm)',
  'bladlengde',
  'bladlengde (cm)',
];

/** Minimal shape for et Woo-attributt slik det ligger i `products.attributes`. */
interface AttributeJson {
  name?: unknown;
  slug?: unknown;
  options?: unknown;
}

/**
 * Parse en attributt-verdi som "20cm", "20", "8 cm", "12,5cm" til antall cm.
 * Returnerer null hvis vi ikke finner et tall i strengen.
 *
 * NB: Hvis verdien er en RANGE-streng som "6-11cm" (lite sannsynlig på en
 * kniv, mer aktuelt for selve knivbeskytteren), tolkes første tall — for
 * en kniv vil dette praktisk talt aldri matter.
 */
function parseLengthCm(raw: string): number | null {
  const match = raw.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  const n = Number(match[1].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Les knivbladlengde fra produktets `attributes`-JSON. Returnerer `null` hvis
 * attributtet mangler eller ikke kan parses. Tar første option (vi forventer
 * én verdi per kniv på dette attributtet).
 */
export function readBladeLengthCm(attributes: unknown): number | null {
  if (!Array.isArray(attributes)) return null;

  for (const raw of attributes as AttributeJson[]) {
    if (!raw || typeof raw !== 'object') continue;
    const slug = typeof raw.slug === 'string' ? raw.slug : '';
    const name = typeof raw.name === 'string' ? raw.name.toLowerCase() : '';
    const matchesSlug = KNIVBLADLENGDE_SLUGS.includes(slug);
    const matchesName = KNIVBLADLENGDE_NAMES.includes(name);
    if (!matchesSlug && !matchesName) continue;

    if (!Array.isArray(raw.options)) continue;
    for (const opt of raw.options) {
      if (typeof opt !== 'string') continue;
      const cm = parseLengthCm(opt);
      if (cm !== null) return cm;
    }
  }

  return null;
}

/**
 * Velg riktig knivbeskytter-SKU basert på bladlengde i cm. Returnerer `null`
 * hvis lengden er utenfor alle range-er (f.eks. lommeknivblad < 6 cm).
 */
export function knivbeskytterSkuForBladeLengthCm(cm: number): string | null {
  for (const range of KNIVBESKYTTER_RANGES) {
    if (cm >= range.minCm && cm <= range.maxCm) return range.sku;
  }
  return null;
}

/**
 * Convenience: les bladlengde fra produkt og returner matchende SKU i ett kall.
 * Returnerer null hvis produktet ikke har bladlengde, eller hvis lengden
 * ikke matcher noen range.
 */
export function knivbeskytterSkuForProductAttributes(
  attributes: unknown,
): string | null {
  const cm = readBladeLengthCm(attributes);
  if (cm === null) return null;
  return knivbeskytterSkuForBladeLengthCm(cm);
}
