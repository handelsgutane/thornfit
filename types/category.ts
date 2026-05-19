/**
 * Category types — mirrors the Supabase `categories` table.
 */

import type { ProductImage } from './product';

export interface Category {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  parentId: number | null;
  image: ProductImage | null;
  seoTitle: string | null;
  seoDescription: string | null;
  displayOrder: number | null;
  syncedAt: string;
}

/** Category with nested children for tree rendering (nav menus, sitemap). */
export interface CategoryNode extends Category {
  children: CategoryNode[];
  productCount?: number;
}
