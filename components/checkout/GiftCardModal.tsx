/**
 * GiftCardModal — Paper I4P-0 (Ikke innlogget) / I4Q-0 (Innlogget) +
 * mobile-varianter HWP-0/HWQ-0.
 *
 * Modal som åpnes fra "Bekreft ordre" når paymentMethod='gift-card'.
 * To distinkte tilstander basert på `isAuthenticated`:
 *
 *   • Utlogget: Stor sentrert gift-ikon, headline "Løs inn gavekort",
 *     beskrivelse, benefits-boks med 3 sjekkpunkter, og CTA-stack
 *     (Logg inn / Opprett profil / Fortsett uten gavekort).
 *
 *   • Innlogget: Profile-row (avatar + navn + e-post + "Innlogget"-pill),
 *     "Legg til gavekort"-input + "Løs inn"-knapp, applied gavekort-pill
 *     (kode + utløp + beløp + fjern-X), "Gavekort trekkes fra"-rad,
 *     restbeløp-info, og "Bruk gavekort + velg betaling"-CTA.
 *
 * Layout:
 *   - Desktop (md+): sentrert kort 520 wide
 *   - Mobile (<md): bottom-sheet med drag-handle (slide-up)
 *
 * Felles header: gift-icon + "Gavekort" 18/22 bold + lukk-X.
 *
 * "Logg inn" og "Opprett profil" navigerer til respektive sider med
 * `?redirect=/checkout` så bruker kommer tilbake hit etter pålogging.
 */

'use client';

import Link from 'next/link';
import { useEffect, useId, useState, useTransition } from 'react';

import { Toast, useToast } from '@/components/ui/Toast';

interface GiftCardModalProps {
  open: boolean;
  onClose: () => void;
  /** Server-injected: er brukeren innlogget? Bestemmer hvilken view-state
   *  som rendres. */
  isAuthenticated: boolean;
  /** Total å trekke fra. Brukes til å beregne restbeløp etter gavekort. */
  amount: number;
  /** For "Innlogget"-staten — vises i profile-row. */
  user?: {
    displayName: string;
    email: string;
  };
  /** Kalles når brukeren har lagt til en gyldig gavekort-kode og klikker
   *  "Bruk gavekort + velg betaling". Lifted state — parent lagrer
   *  applied-koden så order-summary + sticky-bar kan vise restbeløp. */
  onApplied?: (giftCard: {
    code: string;
    validUntil: string;
    amount: number;
  }) => void;
}

export function GiftCardModal({
  open,
  onClose,
  isAuthenticated,
  amount,
  user,
  onApplied,
}: GiftCardModalProps) {
  const dialogId = useId();

  // Body-scroll-lock + Escape-close
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

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${dialogId}-title`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center md:px-4" /* paper-exact: IEC-0/IPH-0 (overlay #00000080) */
    >
      <div className="absolute inset-0" onClick={onClose} aria-hidden />

      <div className="relative flex w-full flex-col overflow-hidden rounded-t-3 bg-surface md:max-w-[520px] md:rounded-1" /* paper-exact: IED-0/IPI-0 (520 desktop, mobile bottom-sheet) */>
        {/* Drag handle — kun mobil */}
        <div className="flex justify-center pt-2 pb-1 md:hidden" aria-hidden>
          <span className="block h-1 w-9 rounded-full bg-divider" />
        </div>

        {/* Header — Paper IEE-0/IPJ-0 */}
        <div className="flex items-center justify-between border-b border-divider px-6 pt-6 pb-5">
          <div className="flex items-center gap-2.5">
            <GiftIconSmall />
            <h2
              id={`${dialogId}-title`}
              className="font-bold text-ink"
              style={{ fontSize: '18px', lineHeight: '22px', letterSpacing: '-0.01em' }} /* paper-exact: IEN-0/IPS-0 (18/22 bold -0.01em) */
            >
              Gavekort
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk"
            className="-mr-1 flex size-8 shrink-0 items-center justify-center text-ink hover:text-aka" /* paper-exact: IEO-0/IPT-0 (32×32) */
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {isAuthenticated ? (
          <GiftCardLoggedIn
            amount={amount}
            user={user}
            onClose={onClose}
            onApplied={onApplied}
          />
        ) : (
          <GiftCardLoggedOut onClose={onClose} />
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Logged-out view — Paper I4P-0 / IET-0                                       */
/* -------------------------------------------------------------------------- */
function GiftCardLoggedOut({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col gap-5 px-6 pt-7 pb-7" /* paper-exact: IET-0 (modal body) */>
      {/* Stort gift-ikon i canvas-sirkel — sentrert */}
      <div className="flex justify-center pt-2">
        <span
          aria-hidden
          className="flex size-16 items-center justify-center rounded-full bg-canvas text-ink-muted" /* paper-exact: IEU-0 (64×64 canvas circle) */
        >
          <GiftIconLarge />
        </span>
      </div>

      {/* Headline + beskrivelse */}
      <div className="flex flex-col gap-2 text-center">
        <h3
          className="font-bold text-ink"
          style={{ fontSize: '20px', lineHeight: '24px', letterSpacing: '-0.01em' }} /* paper-exact: IF4-0 ("Løs inn gavekort") */
        >
          Løs inn gavekort
        </h3>
        <p
          className="text-ink-muted"
          style={{ fontSize: '14px', lineHeight: '21px' }} /* paper-exact: IF5-0 (description 14/21 haiiro) */
        >
          For å bruke gavekort trenger du en Skarpekniver-profil. Koble
          gavekortet til kontoen din og bruk det på tvers av kjøp.
        </p>
      </div>

      {/* Benefits-boks med tre sjekkpunkter */}
      <ul className="flex flex-col gap-3 rounded-1 bg-canvas px-5 py-5" /* paper-exact: IF6-0 (benefits bg canvas) */>
        {[
          'Se saldo og historikk på gavekortet ditt',
          'Bruk på tvers av alle kjøp',
          'Restbeløp lagres automatisk',
        ].map((benefit) => (
          <li key={benefit} className="flex items-center gap-3" /* paper-exact: IF7-0/IFD-0/IFJ-0 */>
            <CheckIcon />
            <span
              className="text-ink"
              style={{ fontSize: '14px', lineHeight: '18px' }} /* paper-exact: IFC-0 (14/18 ink) */
            >
              {benefit}
            </span>
          </li>
        ))}
      </ul>

      {/* CTA-stack — Paper IRB-1: Logg inn / Opprett profil / Fortsett uten */}
      <div className="flex flex-col gap-2.5">
        <Link
          href="/konto/logg-inn?redirect=/checkout"
          className="flex h-12 items-center justify-center rounded-1 bg-aka px-4 font-bold text-shiro transition-opacity hover:opacity-90" /* paper-exact: IRC-1 (h 48 aka) */
          style={{ fontSize: '15px', lineHeight: '18px', letterSpacing: '0.01em' }} /* paper-exact: IRD-1 (15/18 bold shiro) */
        >
          Logg inn
        </Link>
        <Link
          href="/konto/registrer?redirect=/checkout"
          className="flex h-12 items-center justify-center rounded-1 border-[1.5px] border-ink bg-surface px-4 font-bold text-ink transition-colors hover:bg-canvas" /* paper-exact: IRE-1 (h 48 border 1.5 ink) */
          style={{ fontSize: '14px', lineHeight: '18px' }} /* paper-exact: IRF-1 */
        >
          Opprett profil
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 items-center justify-center font-medium text-ink-muted transition-colors hover:text-ink" /* paper-exact: IRG-1 (h 40 muted link) */
          style={{ fontSize: '13px', lineHeight: '16px' }} /* paper-exact: IRH-1 */
        >
          Fortsett uten gavekort
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Logged-in view — Paper I4Q-0 / IRM-1                                        */
/* -------------------------------------------------------------------------- */
function GiftCardLoggedIn({
  amount,
  user,
  onClose,
  onApplied,
}: {
  amount: number;
  user?: { displayName: string; email: string };
  onClose: () => void;
  onApplied?: (giftCard: {
    code: string;
    validUntil: string;
    amount: number;
  }) => void;
}) {
  const [code, setCode] = useState('');
  const [applied, setApplied] = useState<{
    code: string;
    validUntil: string;
    amount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { toastProps, showToast } = useToast();

  const remaining = applied ? Math.max(amount - applied.amount, 0) : amount;
  const initials = user?.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase() ?? 'SK';

  function handleRedeem(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;

    startTransition(async () => {
      // MVP-stub: aksepterer "GAVE-2024-XKQT" som demo-kode. Bytt til
      // /api/gift-cards/redeem når endpoint er implementert.
      await new Promise((r) => setTimeout(r, 400));
      if (trimmed === 'GAVE-2024-XKQT') {
        setApplied({
          code: 'GAVE-2024-XKQT',
          validUntil: '31.12.2025',
          amount: 1500,
        });
        setCode('');
      } else {
        setError('Ugyldig kode. Prøv igjen.');
      }
    });
  }

  function handleProceed() {
    if (!applied) {
      showToast({ variant: 'error', message: 'Legg til et gavekort først.' });
      return;
    }
    // Lift applied-koden til parent (CheckoutClient lagrer den i
    // `appliedGiftCard`-state). Parent viser restbeløp i order-summary
    // og sticky-bar, og styrer videre flow.
    onApplied?.(applied);
    onClose();
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('nb-NO', {
      style: 'currency',
      currency: 'NOK',
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <>
      <form
        onSubmit={handleRedeem}
        className="flex flex-col gap-5 px-6 pt-6 pb-7" /* paper-exact: IRM-1 */
      >
        {/* Profile row — Paper IRN-1 */}
        <div className="flex items-center gap-3 rounded-1 border border-divider bg-canvas px-4 py-3" /* paper-exact: IRN-1 (profile-row) */>
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-contrast font-bold text-ink-inverse" /* paper-exact: IRO-1 (40×40 avatar) */
            style={{ fontSize: '13px', lineHeight: '16px' }} /* paper-exact: IRP-1 */
          >
            {initials}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span
              className="truncate font-bold text-ink"
              style={{ fontSize: '14px', lineHeight: '18px' }} /* paper-exact: IRR-1 (14/18 bold) */
            >
              {user?.displayName ?? 'Skarpekniver-bruker'}
            </span>
            <span
              className="truncate text-ink-muted"
              style={{ fontSize: '13px', lineHeight: '16px' }} /* paper-exact: IRS-1 */
            >
              {user?.email ?? ''}
            </span>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 text-midori" /* paper-exact: IRT-1 (Innlogget-pill green) */>
            <CheckIcon />
            <span style={{ fontSize: '13px', lineHeight: '16px', fontWeight: 500 }} /* paper-exact: IRY-1 */>Innlogget</span>
          </span>
        </div>

        {/* Add card section — Paper IRZ-1 */}
        <div className="flex flex-col gap-2">
          <h3
            className="font-bold text-ink"
            style={{ fontSize: '15px', lineHeight: '18px' }} /* paper-exact: IS0-1 ("Legg til gavekort") */
          >
            Legg til gavekort
          </h3>
          <p className="text-ink-muted" style={{ fontSize: '13px', lineHeight: '20px' }} /* paper-exact: IS1-1 */>
            Skriv inn koden fra gavekortet ditt. Saldoen kobles til profilen
            og trekkes automatisk fra ordren.
          </p>
          <div className="flex items-stretch gap-2" /* paper-exact: IS2-1 */>
            <input
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) setError(null);
              }}
              placeholder="GAVE-XXXX-XXXX"
              aria-label="Gavekort-kode"
              className="flex-1 rounded-1 border border-divider bg-surface px-3.5 py-2.5 font-medium text-ink placeholder:text-ink-muted focus:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2" /* paper-exact: IS3-1 (input border 1, py 11 px 14) */
              style={{ fontSize: '14px', lineHeight: '18px' }}
            />
            <button
              type="submit"
              disabled={pending}
              className="flex shrink-0 items-center justify-center rounded-1 bg-surface-contrast px-4 py-2.5 font-bold text-ink-inverse transition-opacity hover:opacity-90 disabled:opacity-60" /* paper-exact: IS5-1 (Løs inn knapp kuro) */
              style={{ fontSize: '13px', lineHeight: '16px' }}
            >
              {pending ? 'Sjekker…' : 'Løs inn'}
            </button>
          </div>
          {error && (
            <p role="alert" className="text-aka" style={{ fontSize: '12px', lineHeight: '16px' }}>
              {error}
            </p>
          )}
        </div>

        {/* Linked card pill — Paper IS7-1 (vises kun når applied) */}
        {applied && (
          <div className="flex items-center gap-2.5 rounded-1 border border-divider bg-canvas px-3 py-2" /* paper-exact: IS7-1 (linked-card pill) */>
            <span aria-hidden className="text-midori shrink-0">
              <CheckIconLg />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span
                className="truncate font-bold text-ink"
                style={{ fontSize: '13px', lineHeight: '16px' }} /* paper-exact: ISD-1 */
              >
                {applied.code}
              </span>
              <span
                className="truncate text-ink-muted"
                style={{ fontSize: '12px', lineHeight: '16px' }} /* paper-exact: ISE-1 */
              >
                Gyldig til {applied.validUntil}
              </span>
            </div>
            <span
              className="shrink-0 font-bold text-ink"
              style={{ fontSize: '14px', lineHeight: '18px' }} /* paper-exact: ISF-1 */
            >
              {fmt(applied.amount)}
            </span>
            <button
              type="button"
              onClick={() => setApplied(null)}
              aria-label={`Fjern gavekort ${applied.code}`}
              className="flex size-6 shrink-0 items-center justify-center text-ink-muted hover:text-ink" /* paper-exact: ISG-1 (24×24) */
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}

        {/* Trekkes fra-rad + restbeløp-info — Paper ISL-1 + ISO-1 */}
        {applied && (
          <>
            <div className="flex items-center justify-between" /* paper-exact: ISL-1 */>
              <span className="text-ink" style={{ fontSize: '14px', lineHeight: '18px' }}>
                Gavekort trekkes fra
              </span>
              <span className="font-bold text-aka" style={{ fontSize: '14px', lineHeight: '18px' }}>
                −{fmt(applied.amount)}
              </span>
            </div>
            <div className="flex items-start gap-2 rounded-1 bg-canvas px-3 py-2.5" /* paper-exact: ISO-1 */>
              <InfoIcon />
              <span className="text-ink-muted" style={{ fontSize: '13px', lineHeight: '19px' }} /* paper-exact: ISV-1 */>
                Restbeløp på {fmt(remaining)} betales med annen metode.
              </span>
            </div>
          </>
        )}

        {/* CTA — Paper ISW-1 */}
        <button
          type="button"
          onClick={handleProceed}
          disabled={!applied}
          className="flex h-13 items-center justify-center rounded-1 bg-aka font-bold text-shiro transition-opacity hover:opacity-90 disabled:opacity-50" /* paper-exact: ISW-1 (h 52 aka) */
          style={{ fontSize: '15px', lineHeight: '18px', letterSpacing: '0.01em' }} /* paper-exact: ISX-1 */
        >
          Bruk gavekort + velg betaling
        </button>
      </form>
      {toastProps && <Toast {...toastProps} />}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Icons                                                                       */
/* -------------------------------------------------------------------------- */
function GiftIconSmall() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="2" y="7" width="16" height="11" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1 7h18v3H1z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 7v11" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 7C4.5 4 6 2 7.5 2C9 2 10 4 10 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M14.5 7C15.5 4 14 2 12.5 2C11 2 10 4 10 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function GiftIconLarge() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
      <rect x="3" y="10" width="22" height="15" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2 10h24v4H2z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M14 10v15" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 10C7 6 9 3 11 3C13 3 14 6 14 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M20 10C21 6 19 3 17 3C15 3 14 6 14 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden className="shrink-0">
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <path d="M4 7L6 9L10 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIconLg() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M6 10L9 13L14 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="mt-0.5 shrink-0 text-ink-muted">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 7v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="5" r="0.8" fill="currentColor" />
    </svg>
  );
}
