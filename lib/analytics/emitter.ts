'use client';

/**
 * Analytics emitter — `track()` er det eneste kallet komponentene skal kjenne.
 *
 * Ansvar (ADR-0010):
 *   1. Generer et `event_id` per track-call. Sendes til alle klient-adaptere
 *      og til CAPI server-route — plattformene deduplicater på det feltet.
 *   2. Consent-gate per adapter (analytics vs marketing). Events før
 *      samtykke queues; ved grant fyres køen mot de adaptere som nå har
 *      lov. Ved deny forkastes eventet som klient-side (men CAPI fyrer
 *      fortsatt som 1P — plattformenes consent-mode-signaler avgjør bruk).
 *   3. Fire-and-forget POST til `/api/analytics/server-event` for CAPI
 *      server-side fan-out. Aldri blokker komponent-koden på nettverket.
 *
 * Adaptere registreres via `registerAdapter()`. `AnalyticsScripts`-
 * komponenten i `app/layout.tsx` registrerer GA4/Meta/TikTok etter at
 * script-tags har lastet (se task #73/#75).
 */

import { logger } from '@/lib/logger';

import type { AnalyticsEvent } from './events';
import { getConsent, onConsentChange, type AnalyticsConsent } from './consent';

// ---------------------------------------------------------------------------
// Adapter-kontrakt
// ---------------------------------------------------------------------------

export interface AnalyticsAdapter {
  /** Stabil ID for logging + idempotent registrering. */
  name: 'ga4' | 'meta' | 'tiktok';
  /** Hvilken consent-kategori må være gitt for å fyre. */
  consentRequired: 'analytics' | 'marketing';
  /**
   * Er adapteren klar til å fyre? (script lastet, ID konfigurert).
   * Hvis `false`, emitteren hopper over den — ingen kø.
   */
  isAvailable(): boolean;
  /**
   * Oversett et intern event til plattform-dialekt og kall SDK-en.
   * Adaptere skal ikke selv sjekke consent — emitteren gjør det.
   */
  track(event: AnalyticsEvent, eventId: string): void;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const adapters = new Map<AnalyticsAdapter['name'], AnalyticsAdapter>();

interface QueuedEvent {
  event: AnalyticsEvent;
  eventId: string;
  /** Unix ms — used to drop stale events på flush. */
  queuedAt: number;
}

/** Pre-consent queue. Kapasitet-grense for å unngå minne-leak ved CMP-aldri-lastet. */
const queue: QueuedEvent[] = [];
const MAX_QUEUE = 100;
/** 30 min — events eldre enn dette dropper vi ved flush (user har gått videre). */
const QUEUE_TTL_MS = 30 * 60 * 1000;

let consentListenerWired = false;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Registrer en adapter. Idempotent — re-registrering overskriver.
 * Kalles fra `AnalyticsScripts` etter at plattformens script har lastet.
 */
export function registerAdapter(adapter: AnalyticsAdapter): void {
  adapters.set(adapter.name, adapter);
  // Når en ny adapter kommer online, flush evt. queue som matcher consent.
  flushQueue();
}

export function unregisterAdapter(name: AnalyticsAdapter['name']): void {
  adapters.delete(name);
}

/**
 * Fyr et event. Non-blocking, non-throwing — analytics skal aldri ta ned UI.
 *
 * Flyt:
 *   1. Generer event_id.
 *   2. Send til CAPI-routen (fire-and-forget, ignorer feil).
 *   3. For hver registrert adapter: hvis consent er gitt og `isAvailable()`,
 *      kall `track()`. Hvis ikke consent enda, queue og vent på grant.
 */
export function track<E extends AnalyticsEvent>(event: E): void {
  if (typeof window === 'undefined') {
    // Ikke-støttet fra server. Komponenter som fyrer analytics må være klient.
    return;
  }

  const eventId = generateEventId();
  wireConsentListenerOnce();

  // Server-side CAPI fan-out. Ikke consent-gated på klient-siden —
  // selve routen respekterer consent-mode via headers hvis vi vil.
  // Aldri throw — bruk catch på Promise.
  void postServerEvent(event, eventId);

  const consent = getConsent();
  const candidateAdapters = Array.from(adapters.values());

  for (const adapter of candidateAdapters) {
    const canFire = consent[adapter.consentRequired] && adapter.isAvailable();
    if (canFire) {
      try {
        adapter.track(event, eventId);
      } catch (err) {
        logger.error('analytics adapter threw', {
          adapter: adapter.name,
          event: event.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else if (!consent[adapter.consentRequired] && adapter.isAvailable()) {
      // Adapter er klar men mangler consent — queue.
      enqueue({ event, eventId, queuedAt: Date.now() });
    }
    // Adapter ikke tilgjengelig enda → hopp over. Når den registreres senere,
    // fyrer registerAdapter() flushQueue(), og eventet treffer den da.
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function wireConsentListenerOnce() {
  if (consentListenerWired) return;
  consentListenerWired = true;
  onConsentChange(() => flushQueue());
}

function enqueue(q: QueuedEvent) {
  if (queue.length >= MAX_QUEUE) {
    queue.shift(); // drop oldest
  }
  // Dedupe på event_id — ved re-queue fra flere adaptere.
  const existing = queue.find((q2) => q2.eventId === q.eventId);
  if (!existing) queue.push(q);
}

function flushQueue() {
  if (queue.length === 0) return;
  const consent = getConsent();
  const now = Date.now();

  for (let i = queue.length - 1; i >= 0; i--) {
    const q = queue[i];
    if (now - q.queuedAt > QUEUE_TTL_MS) {
      queue.splice(i, 1);
      continue;
    }

    let delivered = false;
    for (const adapter of adapters.values()) {
      if (consent[adapter.consentRequired] && adapter.isAvailable()) {
        try {
          adapter.track(q.event, q.eventId);
          delivered = true;
        } catch (err) {
          logger.error('analytics adapter threw on flush', {
            adapter: adapter.name,
            event: q.event.name,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
    if (delivered) queue.splice(i, 1);
  }
}

/**
 * Fire-and-forget POST til server-route. sendBeacon hvis tilgjengelig (overlever
 * page-unload under `purchase` → thank-you navigation). Fallback til fetch
 * med `keepalive: true`.
 */
function postServerEvent(event: AnalyticsEvent, eventId: string): void {
  const body = JSON.stringify({
    eventId,
    name: event.name,
    payload: event.payload,
    // Inkluder minimum context serveren trenger for CAPI-hashing:
    url: window.location.href,
    referrer: document.referrer || undefined,
    userAgent: navigator.userAgent,
    timestamp: Date.now(),
  });

  const endpoint = '/api/analytics/server-event';

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      const ok = navigator.sendBeacon(endpoint, blob);
      if (ok) return;
    }
    // Fallback. `keepalive` sikrer at requesten ikke blir cancelled ved unload.
    void fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // swallow — analytics må aldri forårsake visible error
    });
  } catch {
    // swallow
  }
}

// ---------------------------------------------------------------------------
// event_id generator
// ---------------------------------------------------------------------------

/**
 * Tids-sorterbar unik ID. Ikke full ULID (trenger ikke monotone-per-ms),
 * men timestamp + base32 random gir oss nok entropy + sortability for
 * pixel↔CAPI-dedupe.
 *
 * Format: `<hex-timestamp-ms>-<8-char-random>` — f.eks. `18f3d0a9b42-a1b2c3d4`.
 */
export function generateEventId(): string {
  const ts = Date.now().toString(16);
  const rand = randomHex(8);
  return `${ts}-${rand}`;
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// Test-only hooks (brukes i verifisering, ikke i produksjon)
// ---------------------------------------------------------------------------

/** @internal Kun for testing — tømmer intern state. */
export function __resetAnalytics(): void {
  adapters.clear();
  queue.length = 0;
  consentListenerWired = false;
}

/** @internal Kun for testing — inspiser køen. */
export function __getQueueSize(): number {
  return queue.length;
}

/** Re-eksporter consent-typer for bekvemmelighet i adapterne. */
export type { AnalyticsConsent };
