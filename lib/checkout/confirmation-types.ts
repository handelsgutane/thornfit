/**
 * Type-kontrakt for det vi viser på `/ordre-bekreftet/[id]`.
 *
 * Holdes i en egen fil (uten `'server-only'`-flag) så både API-route,
 * CheckoutClient (skriver til sessionStorage) og OrderConfirmedView (leser
 * fra sessionStorage) kan importere den uten å dra inn server-avhengigheter.
 *
 * **Sikkerhetsmodell**: alt her er ephemeral klient-state. URL-en
 * `/ordre-bekreftet/12345` er gjettebar, men siden henter ALDRI ordre-data
 * server-side basert på query — den leser kun fra sessionStorage. Direkte-
 * URL-tilgang faller tilbake til generisk "ordre bekreftet"-melding uten
 * å eksponere noe.
 */

export interface OrderConfirmationItem {
  /** Produktnavn — uten merke-prefix. */
  readonly name: string;
  /** Merke-label vist over navn ("Kanetsugu", "Yoshimi Kato", ...). `null` hvis
   *  produktet ikke har eget merke. */
  readonly brand: string | null;
  /** Stock-keeping-unit, brukes i "SKU: ..."-linjen. `null` for produkter uten
   *  egen SKU (faller tilbake til product_id-streng på UI-siden). */
  readonly sku: string | null;
  /** Spec-linje, f.eks. "210mm · VG10". `null` hvis produktet ikke har spec. */
  readonly specLine: string | null;
  /** Produkt-thumb. URL fra Supabase-speilet (samme som i cart). `null` hvis
   *  produktet ikke har bilde — UI faller tilbake til canvas-placeholder. */
  readonly imageUrl: string | null;
  readonly quantity: number;
  /** Enhetspris inkl. MVA i NOK. */
  readonly unitPrice: number;
  /** Total for linjen inkl. MVA. */
  readonly lineTotal: number;
}

export interface OrderConfirmationAddress {
  readonly company: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly postalCode: string;
  readonly city: string;
}

export interface CheckoutOrderConfirmation {
  /** Woo order-id. URL-en bruker denne; siden krever at den matcher
   *  sessionStorage-entry'en for å rendre rik data. */
  readonly orderId: number;
  /** Woos order_number-streng (kan være forskjellig fra orderId). */
  readonly orderNumber: string;
  readonly status: string;
  /** Total inkl. MVA i NOK. */
  readonly total: number;
  readonly currency: string;
  /** E-post bekreftelsen ble sendt til. */
  readonly customerEmail: string;
  /** Fornavn — vises i "Takk, {name}." — kan være tom hvis ikke oppgitt. */
  readonly customerFirstName: string;
  /** Vis-tittel for betalingsmetode, f.eks. "Kort" eller "Faktura". */
  readonly paymentMethodTitle: string;
  /** ISO-timestamp for ordre-opprettelse. */
  readonly createdAt: string;
  /** Items i ordren (light-kopi av cart-items pluss line-totaler). */
  readonly items: ReadonlyArray<OrderConfirmationItem>;
  /** Sum eks. MVA i NOK (delsum). */
  readonly subtotalExVat: number;
  /** MVA-andel av total i NOK. */
  readonly vat: number;
  /** Besparelse på salgspriser i NOK (sum av regularPrice − unitPrice). */
  readonly savings: number;
  /** Frakt-kost inkl. MVA i NOK. `0` for pickup/gratis. */
  readonly shippingCost: number;
  /** Frakt-tittel ("Posten Norge inkl. sporing", "Henting i butikk", etc.). */
  readonly shippingLabel: string;
  /** Frakt-adresse (settes fra checkout-form). */
  readonly shippingAddress: OrderConfirmationAddress;
  /** Vis-tittel for fraktmetode (samme som shippingLabel for nå, holdes som
   *  separat felt i tilfelle Paper-designet senere viser dem ulikt). */
  readonly shippingMethod: string;
}
