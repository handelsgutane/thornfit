'use client';

/**
 * Cart-store — Zustand + `persist`-middleware mot localStorage.
 *
 * **Hvorfor Zustand og ikke Context / Redux / server-cart (per ADR-0011):**
 *   - Cart er anonym før checkout (ADR-0004: custom checkout → ordre pushes
 *     til Woo kun på betaling). Ingen grunn til å persiste til Supabase/Woo
 *     før vi vet hvem brukeren er.
 *   - Zustand er ~1 kB gz, ingen Provider-wrapping, trivielt å hydrere
 *     server-side uten re-render-flash.
 *   - `persist`-middleware håndterer localStorage, versioning, og SSR-
 *     hydration (dual-render-flash) via `onRehydrateStorage` + `hydrated`-flagg.
 *
 * **Denne modulen er "dum"** — den oppbevarer kun state og eksponerer
 * mutations. Analytics-tracking, Algolia-Insights, og Woo-validering skjer
 * i `lib/cart/api.ts` som wrapper disse kallene. Det holder store-koden
 * testbar og adskiller bekymringer.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import type { Cart, CartItem } from '@/types/cart';

// ---------------------------------------------------------------------------
// State + actions
// ---------------------------------------------------------------------------

/**
 * State-shape som faktisk persisteres til localStorage (`PersistedState`).
 * Actions lever kun i runtime og skal ikke serialiseres.
 */
interface CartState extends Cart {
  /**
   * Har `persist`-middleware ferdig-hydrert? Før dette er state default-
   * tom-cart, og komponentene må ikke rendre basert på `items` (ellers får
   * vi "0 items" → "N items" flash på reload). Les via `useCartHydrated()`.
   */
  hydrated: boolean;
}

interface CartActions {
  /**
   * Legg til en ny linje eller øk quantity på eksisterende. Dedup skjer på
   * `CartItem.key` (bygget via `buildCartItemKey(purchasable)`).
   */
  addItem: (item: CartItem) => void;
  /** Fjern én linje helt (uansett quantity). */
  removeItem: (key: string) => void;
  /**
   * Set quantity til et eksakt tall. `quantity <= 0` fjerner linjen.
   * Brukes av +/− steppere på cart-siden.
   */
  setQuantity: (key: string, quantity: number) => void;
  /** Tøm hele kurven — brukes etter vellykket checkout + "Tøm kurv"-knapp. */
  clear: () => void;
  /** Sett coupon-koder (etter validering mot Woo). */
  setCouponCodes: (codes: string[]) => void;
  /** Intern — markerer at persist-hydration er ferdig. */
  _markHydrated: () => void;
}

export type CartStore = CartState & CartActions;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const INITIAL_STATE: CartState = {
  items: [],
  couponCodes: [],
  updatedAt: new Date(0).toISOString(),
  hydrated: false,
};

/**
 * Bump dette når `CartItem`-shapen får breaking-endringer — `persist` bruker
 * det til å invalidere gammelt localStorage-innhold. Ikke bump for additive
 * felt (de blir bare `undefined` for gamle entries).
 */
const STORAGE_VERSION = 1;

const STORAGE_KEY = 'skarpekniver:cart:v1';

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useCartStore = create<CartStore>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,

      addItem: (incoming) =>
        set((state) => {
          const existingIdx = state.items.findIndex((i) => i.key === incoming.key);
          let nextItems: CartItem[];

          if (existingIdx >= 0) {
            // Slå sammen — øk quantity, behold andre felt fra existing
            // (unngå at pris-endring mellom add-kall overstyrer opprinnelig pris
            // brukeren så; Woo validerer uansett ved checkout).
            const existing = state.items[existingIdx];
            nextItems = state.items.slice();
            nextItems[existingIdx] = {
              ...existing,
              quantity: existing.quantity + incoming.quantity,
            };
          } else {
            nextItems = [...state.items, incoming];
          }

          return {
            items: nextItems,
            updatedAt: new Date().toISOString(),
          };
        }),

      removeItem: (key) =>
        set((state) => ({
          items: state.items.filter((i) => i.key !== key),
          updatedAt: new Date().toISOString(),
        })),

      setQuantity: (key, quantity) =>
        set((state) => {
          if (quantity <= 0) {
            return {
              items: state.items.filter((i) => i.key !== key),
              updatedAt: new Date().toISOString(),
            };
          }
          const nextItems = state.items.map((i) =>
            i.key === key ? { ...i, quantity } : i,
          );
          return {
            items: nextItems,
            updatedAt: new Date().toISOString(),
          };
        }),

      clear: () =>
        set(() => ({
          items: [],
          couponCodes: [],
          updatedAt: new Date().toISOString(),
        })),

      setCouponCodes: (codes) =>
        set(() => ({
          couponCodes: codes,
          updatedAt: new Date().toISOString(),
        })),

      _markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => {
        // SSR: localStorage finnes ikke. `createJSONStorage` kalles lazy, men
        // i Next 16 RSC-trær kan den bli evaluert under pre-render. Returner
        // en no-op-storage så hydration fortsatt ender på default-state.
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return window.localStorage;
      }),
      // Ikke persist `hydrated`-flagget — det skal alltid starte false og
      // settes til true via `onRehydrateStorage`.
      partialize: (state) => ({
        items: state.items,
        couponCodes: state.couponCodes,
        updatedAt: state.updatedAt,
      }),
      onRehydrateStorage: () => (state) => {
        // Kalles etter at `storage.getItem` er evaluert. `state` er `undefined`
        // hvis parsing feilet — da beholder vi INITIAL_STATE + marker hydrated.
        state?._markHydrated();
      },
    },
  ),
);

// ---------------------------------------------------------------------------
// Selectors (stable references → færre re-renders)
// ---------------------------------------------------------------------------

/** Total antall items i kurven (sum av quantity). For badge i Header. */
export const selectCartCount = (s: CartStore) =>
  s.items.reduce((acc, i) => acc + i.quantity, 0);

export const selectCartItems = (s: CartStore) => s.items;
export const selectHydrated = (s: CartStore) => s.hydrated;
