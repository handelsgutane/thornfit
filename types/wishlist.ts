/**
 * Ønskeliste-typer.
 *
 * WishlistItem er et produkt-snapshot som lagres i localStorage via Zustand.
 * Vi lagrer nok data til å rendre kortet uten å fetche fra DB på nytt.
 */

export interface WishlistItem {
  /** Woo produkt-ID */
  readonly id: number;
  readonly slug: string;
  /** Full URL-path, f.eks. "/kniver/kokkekniver/global-g2" */
  readonly href: string;
  readonly name: string;
  /** Merke / primær-kategori-slug — vises som brand-label på kortet */
  readonly brand: string | null;
  /** Spec-linje, f.eks. "210mm · VG10" */
  readonly specLine: string | null;
  readonly price: number | null;
  readonly salePrice: number | null;
  readonly regularPrice: number | null;
  readonly stockStatus: 'in_stock' | 'out_of_stock' | 'on_backorder';
  readonly image: { src: string; alt: string } | null;
  /** ISO-timestamp for når produktet ble lagret */
  readonly addedAt: string;
}
