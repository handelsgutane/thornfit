'use client';

/**
 * Consent-gate — CMP-agnostisk API på toppen av `window`-integrasjoner.
 *
 * Forutsetning (ADR-0010): vi eier ikke CMP-en. Butikken kommer til å kjøre
 * Cookiebot (eller en tilsvarende CMP) som eksponerer `window.CookieConsent`
 * og fyrer `CookieConsentDeclaration`-event. Denne modulen leser/lytter på
 * det, og defaulter til `deny` i alle kanter (SSR, pre-script, ukjent CMP).
 *
 * Hvis dere senere bytter CMP (Axeptio, Osano, OneTrust), erstatt kun
 * implementasjonen her — `getConsent()` + `onConsentChange()` er kontrakten
 * resten av analytics-laget forholder seg til.
 *
 * Consent-kategorier vi bryr oss om:
 *   - `analytics`  → GA4 (aggregert analytics uten ads-bruk)
 *   - `marketing`  → Meta Pixel, TikTok Pixel (annonse-målretting)
 *
 * Cookiebot bruker kategoriene `preferences`, `statistics`, `marketing`.
 * Vi mapper `statistics → analytics` og `marketing → marketing`.
 */

export interface AnalyticsConsent {
  analytics: boolean;
  marketing: boolean;
}

export const DENIED_CONSENT: AnalyticsConsent = {
  analytics: false,
  marketing: false,
};

type Listener = (consent: AnalyticsConsent) => void;

// ---------------------------------------------------------------------------
// Global state — SSR-safe (alle lesninger sjekker `typeof window`).
// ---------------------------------------------------------------------------

const listeners = new Set<Listener>();
let lastSnapshot: AnalyticsConsent = DENIED_CONSENT;
let wired = false;

// ---------------------------------------------------------------------------
// CMP integrations
// ---------------------------------------------------------------------------

/**
 * Cookiebot-integrasjon. `window.Cookiebot` eksisterer når scriptet har lastet.
 * Se https://www.cookiebot.com/en/developer/ — feltene er stabile siden v3.
 */
interface CookiebotGlobal {
  consent: {
    statistics: boolean;
    marketing: boolean;
    preferences: boolean;
    necessary: boolean;
  };
  consented: boolean;
}

declare global {
  interface Window {
    Cookiebot?: CookiebotGlobal;
    /**
     * Override-hook for manuell testing eller alternative CMPer.
     * Sett `window.__sknConsent = { analytics: true, marketing: true }` i
     * konsollen for å teste analytics-laget uten CMP.
     */
    __sknConsent?: AnalyticsConsent;
  }
}

function readFromWindow(): AnalyticsConsent {
  if (typeof window === 'undefined') return DENIED_CONSENT;

  // Testing-override vinner hvis satt (se declare global).
  if (window.__sknConsent) return window.__sknConsent;

  const cb = window.Cookiebot;
  if (cb && cb.consented) {
    return {
      analytics: Boolean(cb.consent.statistics),
      marketing: Boolean(cb.consent.marketing),
    };
  }

  // Ingen CMP lastet enda eller ikke samtykket → deny by default.
  return DENIED_CONSENT;
}

function wireCmp() {
  if (wired || typeof window === 'undefined') return;
  wired = true;

  // Cookiebot-events. Alle tre trigges ved endring; `CookieConsentDeclaration`
  // fyres etter at brukeren har lagret valg (med eller uten samtykke).
  const handler = () => emit();
  window.addEventListener('CookieConsentDeclaration', handler);
  window.addEventListener('CookiebotOnAccept', handler);
  window.addEventListener('CookiebotOnDecline', handler);

  // Initial snapshot — hvis scriptet allerede var lastet før vi wiret opp.
  lastSnapshot = readFromWindow();
}

function emit() {
  const next = readFromWindow();
  const changed =
    next.analytics !== lastSnapshot.analytics ||
    next.marketing !== lastSnapshot.marketing;
  lastSnapshot = next;
  if (changed) {
    for (const cb of listeners) cb(next);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Synkron consent-lesning. Safe å kalle fra server (returnerer DENIED).
 */
export function getConsent(): AnalyticsConsent {
  if (typeof window === 'undefined') return DENIED_CONSENT;
  wireCmp();
  return readFromWindow();
}

/**
 * Abonnér på consent-endringer. Returnerer unsubscribe-funksjon.
 *
 * Callback fyres ved faktisk endring (ikke no-op re-emit ved samme verdi).
 * Første snapshot må hentes separat via `getConsent()` hvis du trenger den
 * med en gang — dette holder API-et rent og predictable.
 */
export function onConsentChange(listener: Listener): () => void {
  wireCmp();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Brukes av emitteren for å bestemme om en gitt adapter har lov til å fyre.
 */
export function hasConsentFor(
  category: 'analytics' | 'marketing',
): boolean {
  return getConsent()[category];
}
