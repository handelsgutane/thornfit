/**
 * Public surface av cart-laget. Komponenter skal kun importere herfra.
 *
 * Se ADR-0011 for state-pattern-beslutning og `docs/business-logic.md` >
 * "Handlekurv" for end-to-end-flyten.
 */

export {
  addToCart,
  removeFromCart,
  setQuantity,
  clearCart,
  purchasableToCartItem,
} from './api';

export {
  useCartItems,
  useCartCount,
  useCartTotals,
  useCartHydrated,
  useCartItemQuantity,
} from './hooks';

export { computeCartTotals, formatNok, mergeCartItems } from './totals';

// Intern store eksponeres kun for avanserte use cases (test, debug). Normal
// komponent-kode skal bruke hooks ovenfor, ikke selectors.
export { useCartStore } from './store';
