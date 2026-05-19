/**
 * Public surface av analytics-laget. Komponenter skal kun importere herfra —
 * aldri direkte fra `emitter`/`adapters/*`.
 *
 * Se ADR-0010 for design og `docs/integrations.md` > Analytics for bruk.
 */

export { track, registerAdapter, unregisterAdapter, generateEventId } from './emitter';
export type { AnalyticsAdapter, AnalyticsConsent } from './emitter';
export type {
  AnalyticsEvent,
  AnalyticsEventName,
  AnalyticsEventPayload,
  AnalyticsItem,
} from './events';
export { ANALYTICS_CURRENCY } from './events';
export {
  catalogListItemToAnalyticsItem,
  catalogProductDetailToAnalyticsItem,
  productToAnalyticsItem,
  cartItemToAnalyticsItem,
} from './items';
export { getConsent, onConsentChange, hasConsentFor, DENIED_CONSENT } from './consent';
