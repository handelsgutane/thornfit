/**
 * Product types — mirrors the Supabase `products` + `product_variations` tables.
 *
 * See docs/data-model.md for the SQL schema these types are derived from.
 * When the schema changes, regenerate via `supabase gen types typescript`
 * and update `types/supabase.ts`. These hand-written types are domain-facing
 * (used by components); keep them in sync but not 1:1.
 */

export type ProductType = 'simple' | 'variable' | 'grouped';

export type ProductStatus = 'published' | 'private' | 'draft' | 'trash';

export type StockStatus = 'in_stock' | 'out_of_stock' | 'on_backorder';

export interface ProductImage {
  url: string;
  alt: string;
  width?: number;
  height?: number;
  blurDataUrl?: string;
}

export interface ProductAttribute {
  name: string;
  slug: string;
  values: string[];
  /** Whether this attribute is used to construct variations. */
  variation: boolean;
}

/**
 * Base product as stored in Supabase (mirrored from Woo).
 * Use `ProductWithVariations` when variations are joined in.
 */
export interface Product {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  shortDescription: string | null;
  sku: string | null;
  type: ProductType;
  status: ProductStatus;

  /** Price fields null for variable products — use variation price. */
  price: number | null;
  regularPrice: number | null;
  salePrice: number | null;

  stockQuantity: number | null;
  stockStatus: StockStatus;
  weightGrams: number | null;

  categoryIds: number[];
  images: ProductImage[];
  attributes: ProductAttribute[];

  seoTitle: string | null;
  seoDescription: string | null;

  createdAt: string;
  updatedAt: string;
  syncedAt: string;
}

export interface ProductVariation {
  id: number;
  parentId: number;
  sku: string | null;
  price: number | null;
  regularPrice: number | null;
  salePrice: number | null;
  stockQuantity: number | null;
  stockStatus: StockStatus;
  weightGrams: number | null;
  /** Map of attribute slug → value (e.g. `{ lengde: '20cm' }`). */
  attributes: Record<string, string>;
  image: ProductImage | null;
  syncedAt: string;
}

export interface ProductWithVariations extends Product {
  variations: ProductVariation[];
}

/** A variation or simple product in a minimal shape suitable for cart / pricing. */
export interface Purchasable {
  productId: number;
  variationId: number | null;
  sku: string | null;
  name: string;
  price: number;
  regularPrice: number;
  onSale: boolean;
  image: ProductImage | null;
  /** Optional — used to show "Få igjen (n)". */
  stockQuantity: number | null;
  stockStatus: StockStatus;
}
