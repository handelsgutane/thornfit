/**
 * Ephemeral client-side storage for "ordre bekreftet"-siden.
 *
 * Vi skriver det API-et returnerte etter `POST /api/checkout/order` til
 * sessionStorage før vi redirecter til `/takk-for-handelen`. Siden leser
 * fra sessionStorage og rendrer det den finner — den gjør INGEN server-
 * fetch på ordre-id, fordi:
 *
 *   - URL-er som `?id=12345` er gjettebare. Hvis vi hentet ordre-detaljer
 *     basert på query-paramen, kunne en bot/angriper iterert IDer og lest
 *     andre kunders ordre.
 *   - Klienten har allerede den lille mengden info en thank-you trenger
 *     (ordre-nummer, total, valuta, status). Vi trenger ikke gå tilbake
 *     til serveren.
 *   - Innlogget bruker som vil se line-items, adresser, tracking osv.
 *     lenkes til `/konto/ordrer/[id]` der auth-gaten allerede er på
 *     plass.
 *
 * sessionStorage er valgt over localStorage fordi:
 *   - State trengs kun i denne tab'en, fra checkout → thank-you.
 *   - Sletter seg automatisk når tab-en lukkes — ordre-info blir ikke
 *     liggende i browseren etter at brukeren forlater siden.
 *   - Ikke tilgjengelig fra andre tabs (samme-domene), ikke synkronisert
 *     på tvers av enheter.
 *
 * Versjonering: STORAGE_VERSION bumpes hvis shapen endres breaking. Da blir
 * gamle entries (mellom commits) stille ignorert ved lese.
 */

import type { CheckoutOrderConfirmation } from './confirmation-types';

const STORAGE_KEY = 'thornfit:checkout:confirmation:v1';

/** Live-tid: hvor lenge en confirmation er "fersk" — etter dette dropper vi
 *  den ved lese (selv om sessionStorage fortsatt har den). 30 min holder
 *  for at en bruker kan refreshe takk-siden et par ganger. Etter det er
 *  det greit at den faller tilbake til generic-fallback. */
const MAX_AGE_MS = 30 * 60 * 1000;

interface StoredEntry {
  readonly version: 1;
  readonly storedAt: number;
  readonly payload: CheckoutOrderConfirmation;
}

function isStoredEntry(value: unknown): value is StoredEntry {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 1 &&
    typeof v.storedAt === 'number' &&
    !!v.payload &&
    typeof v.payload === 'object'
  );
}

/**
 * Skriv ordre-bekreftelse til sessionStorage. Trygg å kalle på server-side
 * (no-op) — caller'en (klient-komponenten) har allerede `'use client'`-flag.
 */
export function writeCheckoutConfirmation(
  payload: CheckoutOrderConfirmation,
): void {
  if (typeof window === 'undefined') return;
  try {
    const entry: StoredEntry = {
      version: 1,
      storedAt: Date.now(),
      payload,
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // QuotaExceeded eller privacy-mode: vi mister bare den rike
    // thank-you-rendringen. Brukeren får generic fallback. Ikke kritisk.
  }
}

/**
 * Les ordre-bekreftelse fra sessionStorage. Returnerer `null` hvis:
 *   - kjører på server,
 *   - storage er tom / ulesbar,
 *   - entry er for gammel (>30 min),
 *   - shapen ikke matcher (gammel commit).
 */
export function readCheckoutConfirmation(): CheckoutOrderConfirmation | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isStoredEntry(parsed)) return null;
    if (Date.now() - parsed.storedAt > MAX_AGE_MS) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.payload;
  } catch {
    return null;
  }
}

/** Fjern entry. Kalles ikke i normal-flyten — sessionStorage rydder selv på
 *  tab-close. Kan brukes hvis vi vil logge brukeren ut og tømme alt. */
export function clearCheckoutConfirmation(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignored
  }
}
