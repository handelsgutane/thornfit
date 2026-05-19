/**
 * CardPaymentModal — Paper HPS-0 (Checkout — Betal med kort).
 *
 * Modal som åpnes etter at Woo-ordren er opprettet og Nexi-payment-session
 * er initiert. Mounter Nexi sitt embedded-checkout-bibliotek inne i body-
 * området slik at brukeren kan fullføre kort-betaling uten å forlate
 * checkout-siden.
 *
 * Flyt:
 *   1. CheckoutClient kaller `/api/checkout/order` → får `orderId`.
 *   2. CheckoutClient kaller `/api/payments/nexi/init` med `{ orderId, orderKey }`
 *      → får `{ paymentId, checkoutKey, environment }`.
 *   3. CheckoutClient renderer denne modalen med disse propsene.
 *   4. Modalen laster Nexi sin checkout.js fra test- eller live-CDN.
 *   5. `new Dibs.Checkout({ checkoutKey, paymentId, containerId })` mounter
 *      Nexi-iframen i `<div id={containerId} />`.
 *   6. Vi lytter på `payment-completed`, `payment-failed`, `payment-cancelled`.
 *   7. Suksess → `onSuccess()` kjører i CheckoutClient, som skriver
 *      sessionStorage og redirecter til `/takk-for-handelen`.
 *   8. Webhook (`/api/webhooks/nexi`) flytter Woo-ordren til `processing`
 *      i parallell — uavhengig av om klienten klarer å redirecte eller ikke.
 *
 * Sikkerhet:
 *   - `checkoutKey` er public-safe per Nexi-dokumentasjon (sendes med i
 *     bundle).
 *   - `paymentId` er server-generert for denne spesifikke ordren — ikke
 *     gjettebar.
 *   - Kortdata når aldri vår frontend; Nexi-iframen er på Nexi-domene.
 */

'use client';

import { useEffect, useId, useRef, useState } from 'react';

interface CardPaymentModalProps {
  open: boolean;
  onClose: () => void;
  /** Nexi paymentId fra `/api/payments/nexi/init`. Modalen rendrer placeholder
   *  hvis null/undefined (init ikke ferdig enda). */
  paymentId: string | null;
  /** Public Nexi-frontend-key (`NEXT_PUBLIC_NEXI_CHECKOUT_KEY`). */
  checkoutKey: string | null;
  /** Hvilket Nexi-miljø vi snakker mot — bestemmer hvilken checkout.js vi
   *  laster. */
  environment: 'test' | 'live';
  /** Callback når Nexi rapporterer vellykket betaling. */
  onSuccess: () => void;
  /** Callback hvis Nexi rapporterer feil/cancel underveis. */
  onError?: (message: string) => void;
}

// ---------------------------------------------------------------------------
// Type-deklarasjon for Nexi sitt globale `Dibs`-objekt
// ---------------------------------------------------------------------------

interface NexiCheckoutHandle {
  on(eventName: 'payment-completed', handler: (event: unknown) => void): void;
  on(eventName: 'payment-failed', handler: (event: unknown) => void): void;
  on(eventName: 'pay-initialized', handler: () => void): void;
  send?(eventName: string, payload?: unknown): void;
}

interface NexiCheckoutOptions {
  checkoutKey: string;
  paymentId: string;
  containerId: string;
  language?: string;
  theme?: { textColor?: string; primaryColor?: string };
}

interface DibsGlobal {
  Checkout: new (options: NexiCheckoutOptions) => NexiCheckoutHandle;
}

declare global {
  interface Window {
    Dibs?: DibsGlobal;
  }
}

const SCRIPT_URLS = {
  test: 'https://test.checkout.dibspayment.eu/v1/checkout.js?v=1',
  live: 'https://checkout.dibspayment.eu/v1/checkout.js?v=1',
} as const;

/** Loader script én gang — caches Promise globalt så flere modal-mounts
 *  ikke laster scriptet flere ganger. */
const scriptLoaders: Record<'test' | 'live', Promise<void> | null> = {
  test: null,
  live: null,
};

function loadNexiScript(environment: 'test' | 'live'): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('window is not available'));
  }
  if (window.Dibs) return Promise.resolve();
  if (scriptLoaders[environment]) return scriptLoaders[environment]!;

  scriptLoaders[environment] = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URLS[environment];
    script.async = true;
    script.onload = () => {
      if (window.Dibs) resolve();
      else reject(new Error('Nexi script loaded but window.Dibs is missing'));
    };
    script.onerror = () => reject(new Error('Failed to load Nexi script'));
    document.body.appendChild(script);
  });

  return scriptLoaders[environment]!;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CardPaymentModal({
  open,
  onClose,
  paymentId,
  checkoutKey,
  environment,
  onSuccess,
  onError,
}: CardPaymentModalProps) {
  const dialogId = useId();
  const containerId = `nexi-checkout-${dialogId.replace(/[^a-z0-9]/gi, '')}`;
  const checkoutHandleRef = useRef<NexiCheckoutHandle | null>(null);
  const mountedPaymentIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Body-scroll-lock + Escape-close mens modal er åpen.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  // Mount Nexi sin checkout når modalen åpnes og vi har paymentId+checkoutKey.
  useEffect(() => {
    if (!open) {
      // Lukket → reset mount-tracking. `error`-state ryddes ikke her — det
      // er greit: når modal åpnes igjen, går vi gjennom mount-blokken som
      // setter error til null før vi starter ny mount-attempt.
      mountedPaymentIdRef.current = null;
      return;
    }
    if (!paymentId || !checkoutKey) {
      // Init ikke ferdig — placeholder vises.
      return;
    }
    if (mountedPaymentIdRef.current === paymentId) {
      // Allerede mountet — Nexi-handle håndterer eget lifecycle.
      return;
    }

    let cancelled = false;
    // Reset error fra forrige mount-attempt før vi starter ny.
    setError(null);

    (async () => {
      try {
        await loadNexiScript(environment);
        if (cancelled) return;

        if (!window.Dibs) {
          throw new Error('Nexi-skriptet ble lastet, men Dibs-objektet finnes ikke');
        }

        // Defensiv: tøm container før vi mounter på nytt — hvis
        // useEffect-en kjører to ganger i StrictMode dev, vil ellers Nexi
        // mounte to iframer.
        const container = document.getElementById(containerId);
        if (container) container.innerHTML = '';

        const checkout = new window.Dibs.Checkout({
          checkoutKey,
          paymentId,
          containerId,
          language: 'nb-NO',
        });

        checkout.on('payment-completed', () => {
          if (cancelled) return;
          // Selv om Nexi sier completed, er pengene KUN reservert (manual
          // capture). Vår webhook flytter Woo-ordren til processing — og
          // klient redirecter her uten å vente på det.
          onSuccess();
        });

        checkout.on('payment-failed', () => {
          if (cancelled) return;
          const msg =
            'Betalingen ble ikke gjennomført. Sjekk kortet ditt og prøv igjen.';
          setError(msg);
          onError?.(msg);
        });

        checkoutHandleRef.current = checkout;
        mountedPaymentIdRef.current = paymentId;
      } catch (err) {
        if (cancelled) return;
        console.error('[CardPaymentModal] Nexi mount failed', err);
        const msg =
          'Vi klarte ikke å laste betalings-vinduet. Sjekk forbindelsen og prøv igjen.';
        setError(msg);
        onError?.(msg);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, paymentId, checkoutKey, environment, containerId, onSuccess, onError]);

  if (!open) return null;

  const isReady = paymentId !== null && checkoutKey !== null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${dialogId}-title`}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 md:items-center md:px-4" /* paper-exact: HPR-0 / HTU-0 (overlay; mobil = full-screen via items-start + h-full, desktop = sentrert) */
    >
      {/* Mobil: full-screen (h-full + items-start gjør at modalen dekker
          hele skjermen fra toppen — Nexi-iframen er typisk høyere enn
          viewport så vi må kunne scrolle).
          Desktop: sentrert, bredere boks (768) + max-høyde som gir 15 px
          luft over og under. Body-en får intern scroll på begge skjerm-
          størrelser.

          NB: backdrop-click lukker IKKE modalen — kunden må spesifikt
          klikke "Stopp betaling"-knappen i header eller bruke Escape for
          å avbryte. Dette unngår at en utilsiktet klikk avbryter en
          pågående betaling. */}
      <div
        className="relative flex h-full w-full flex-col overflow-hidden bg-surface md:h-auto md:max-h-[calc(100vh-30px)] md:max-w-3xl md:rounded-1" /* paper-exact: HTV-0 (mobile full-screen) / HPS-0 (desktop centered, 15 px margin top+bottom) */
      >
        {/* Header — Paper HPT-0: pt 24 / px 24 / pb 20, border-bottom sakai.
            `flex-shrink-0` så header ikke kollapser når body skroller.
            Tittel til venstre, primær avbryt-knapp til høyre. Kort-logoer
            (VISA/MC/Amex) er fjernet fra header — Nexi viser sine egne
            betalingsmetode-ikoner inni iframen. */}
        <div className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-divider px-6 pt-6 pb-5" /* paper-exact: HPT-0 */>
          <h2
            id={`${dialogId}-title`}
            className="font-bold text-ink"
            style={{ fontSize: '18px', lineHeight: '22px', letterSpacing: '-0.01em' }} /* paper-exact: HPY-0 (18/22 bold -0.01em) */
          >
            Betal med kort
          </h2>

          <button
            type="button"
            onClick={onClose}
            className="flex shrink-0 items-center gap-1.5 rounded-1 border border-ink bg-surface px-3 py-2 font-bold text-ink transition-colors hover:bg-canvas"
            style={{ fontSize: '13px', lineHeight: '16px' }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
              <path
                d="M3 3L13 13M13 3L3 13"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            Stopp betaling
          </button>
        </div>

        {/* Body — Nexi mounter sitt iframe inne i denne containeren.
            `flex-1` får body til å fylle alt mellom header og footer.
            `overflow-y-auto` gir intern vertikal scroll når Nexi-iframen
            er høyere enn tilgjengelig høyde (typisk 1100+ px på enkelte
            betalingsmetoder).
            INGEN horisontal padding her — Nexi-iframen får full modal-
            bredde slik at innholdet kan reflowe bredere (kortfelter side
            ved side på desktop) og dermed bli kortere vertikalt. */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto py-4" /* paper-exact: HQB-0 (py 16, ingen horisontal padding) */>
          {error ? (
            <div className="flex min-h-44 flex-col items-center justify-center gap-3 text-center text-ink" /* paper-exact: HQB-0 (~174 → 176 via Tailwind default 44) */>
              <p className="text-body-sm text-aka">{error}</p>
              <button
                type="button"
                onClick={onClose}
                className="text-body-sm font-medium text-ink underline hover:text-aka"
              >
                Lukk og prøv igjen
              </button>
            </div>
          ) : isReady ? (
            <div
              id={containerId}
              className="min-h-96 w-full" /* Nexi iframe ≥384px (min-h-96) gir plass til de fleste betalingsmetoder; iframen self-resizer hvis innholdet trenger mer */
            />
          ) : (
            <div className="flex min-h-44 flex-col items-center justify-center gap-3 text-ink-muted" /* paper-exact: HQB-0 (~174 → 176 via Tailwind default 44) */>
              <svg width="24" height="24" viewBox="0 0 24 24" className="animate-spin text-aka" aria-hidden>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeDasharray="40 40" />
              </svg>
              <p className="text-body-sm">Laster sikker betaling…</p>
            </div>
          )}
        </div>

        {/* Footer fjernet — "Stopp betaling"-knappen er nå i header,
            og Nexi-iframen tar all vertikal plass mellom header og bunn. */}
      </div>
    </div>
  );
}
