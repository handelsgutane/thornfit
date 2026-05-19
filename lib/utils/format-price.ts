/**
 * Pris-formatering for norsk marked.
 *
 * Konvensjoner (se docs/brandbook.md > "Tall og enheter"):
 * - Desimal-komma: `1 290,00 kr`
 * - Hardt mellomrom som tusenskille: `1 290 kr`
 * - `kr` som symbol i UI, `NOK` i tekniske sammenhenger
 * - Desimaler skjules hvis produktet er prisende på hele kroner
 */

const NBSP = '\u00A0';

export interface FormatPriceOptions {
  /** Tving alltid fram to desimaler (default: kun hvis ikke hele kroner). */
  forceDecimals?: boolean;
  /** Bruk `NOK` i stedet for `kr`. Default: `kr`. */
  iso?: boolean;
  /** Skjul valuta-enhet helt. */
  hideCurrency?: boolean;
}

/**
 * Formater pris i NOK med norske konvensjoner.
 *
 * ```ts
 * formatPrice(1290)        // "1 290 kr"
 * formatPrice(1290.5)      // "1 290,50 kr"
 * formatPrice(990)         // "990 kr"
 * formatPrice(1290, { iso: true })        // "1 290 NOK"
 * formatPrice(1290, { forceDecimals: true }) // "1 290,00 kr"
 * ```
 */
export function formatPrice(
  amount: number | string | null | undefined,
  options: FormatPriceOptions = {},
): string {
  const num = typeof amount === 'string' ? Number(amount) : amount;
  if (num == null || Number.isNaN(num)) return '';

  const showDecimals = options.forceDecimals || num % 1 !== 0;

  const formatter = new Intl.NumberFormat('nb-NO', {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  });

  const formatted = formatter.format(num).replace(/\s/g, NBSP);

  if (options.hideCurrency) return formatted;
  const unit = options.iso ? 'NOK' : 'kr';
  return `${formatted}${NBSP}${unit}`;
}

/**
 * Returner true hvis `salePrice` er lavere enn `regularPrice` og begge er gyldige.
 * Brukes for å vise kampanjepris i UI.
 */
export function isOnSale(
  regularPrice: number | string | null | undefined,
  salePrice: number | string | null | undefined,
): boolean {
  const reg = typeof regularPrice === 'string' ? Number(regularPrice) : regularPrice;
  const sale = typeof salePrice === 'string' ? Number(salePrice) : salePrice;
  if (reg == null || sale == null || Number.isNaN(reg) || Number.isNaN(sale)) return false;
  return sale > 0 && sale < reg;
}

/**
 * Rabatt i prosent, avrundet til nærmeste heltall.
 * Returnerer null hvis ikke på salg.
 */
export function discountPercent(
  regularPrice: number | string | null | undefined,
  salePrice: number | string | null | undefined,
): number | null {
  if (!isOnSale(regularPrice, salePrice)) return null;
  const reg = Number(regularPrice);
  const sale = Number(salePrice);
  return Math.round(((reg - sale) / reg) * 100);
}
