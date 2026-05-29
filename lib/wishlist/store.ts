'use client';

/**
 * Wishlist-store — Zustand + persist mot localStorage.
 *
 * Følger samme mønster som `lib/cart/store.ts`. Ønskelisten er klient-side
 * for nå — kobles mot Woo-endpoint i en fremtidig milestone.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { WishlistItem } from '@/types/wishlist';

// ---------------------------------------------------------------------------
// State + actions
// ---------------------------------------------------------------------------

interface WishlistState {
  items: WishlistItem[];
  hydrated: boolean;
}

interface WishlistActions {
  addItem: (item: WishlistItem) => void;
  removeItem: (id: number) => void;
  hasItem: (id: number) => boolean;
  clear: () => void;
  _markHydrated: () => void;
}

export type WishlistStore = WishlistState & WishlistActions;

const INITIAL_STATE: WishlistState = {
  items: [],
  hydrated: false,
};

const STORAGE_VERSION = 1;
const STORAGE_KEY = 'thornfit:wishlist:v1';

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWishlistStore = create<WishlistStore>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      addItem: (item) =>
        set((state) => {
          if (state.items.some((i) => i.id === item.id)) return state;
          return { items: [...state.items, item] };
        }),

      removeItem: (id) =>
        set((state) => ({
          items: state.items.filter((i) => i.id !== id),
        })),

      hasItem: (id) => get().items.some((i) => i.id === id),

      clear: () => set({ items: [] }),

      _markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        }
        return window.localStorage;
      }),
      partialize: (state) => ({ items: state.items }),
      onRehydrateStorage: () => (state) => {
        state?._markHydrated();
      },
    },
  ),
);

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectWishlistItems = (s: WishlistStore) => s.items;
export const selectWishlistCount = (s: WishlistStore) => s.items.length;
export const selectWishlistHydrated = (s: WishlistStore) => s.hydrated;
