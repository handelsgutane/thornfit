'use client';

/**
 * Toast — kortvarig handlingsbekreftelse (Paper BW3-0).
 *
 * Posisjon: fixed bottom-4 right-4 (desktop). Auto-dismiss 4s.
 * Tre varianter: success (grønn), error (rød/aka), info (grå).
 *
 * Bruk `useToast`-hooken for å vise/skjule:
 *   const { showToast, toastProps } = useToast();
 *   showToast({ variant: 'success', message: 'Endringer lagret' });
 *   {toastProps && <Toast {...toastProps} />}
 *
 * NB: Ikke bruk Toast til vedvarende valideringsfeil i skjema — det er
 * Banner sin rolle. Toast er for action-bekreftelser som auto-dismisses.
 */

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils/cn';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastOptions {
  variant: ToastVariant;
  message: string;
  /** Valgfri handlingslenke — f.eks. "Se ønskeliste →" */
  action?: { label: string; href: string };
}

export interface ToastProps extends ToastOptions {
  onDismiss: () => void;
}

// ---------------------------------------------------------------------------
// Visual component
// ---------------------------------------------------------------------------

export function Toast({ variant, message, action, onDismiss }: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        'fixed bottom-4 right-4 z-50',
        'flex items-center gap-3',
        'min-w-[260px] max-w-sm',
        'rounded-1 border border-divider bg-surface',
        'py-3.5 px-4',
        // Paper BW3-0: 0px 2px 12px rgba(0,0,0,0.08)
        'shadow-[0px_2px_12px_rgba(0,0,0,0.08)]',
      )}
    >
      {/* Ikon-sirkel */}
      <span
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full',
          variant === 'success' && 'bg-[#16A34A]',
          variant === 'error'   && 'bg-aka',
          variant === 'info'    && 'bg-ink-muted',
        )}
        aria-hidden
      >
        {variant === 'success' && <CheckIcon />}
        {variant === 'error'   && <XIconSmall />}
        {variant === 'info'    && <InfoIcon />}
      </span>

      {/* Melding */}
      <span className="grow text-body-sm font-medium text-ink">
        {message}
      </span>

      {/* Handlingslenke */}
      {action && (
        <Link
          href={action.href}
          className="mr-2 shrink-0 text-body-xs font-medium text-aka hover:underline"
          onClick={onDismiss}
        >
          {action.label}
        </Link>
      )}

      {/* Lukk */}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Lukk melding"
        className="shrink-0 text-ink-muted transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-1"
      >
        <DismissIcon />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const DISMISS_AFTER_MS = 4000;

export function useToast() {
  const [toastProps, setToastProps] = useState<ToastProps | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToastProps(null);
  }, []);

  const showToast = useCallback(
    (options: ToastOptions) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setToastProps({ ...options, onDismiss: dismiss });
      timerRef.current = setTimeout(dismiss, DISMISS_AFTER_MS);
    },
    [dismiss],
  );

  // Rydd opp timer ved unmount
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { toastProps, showToast };
}

// ---------------------------------------------------------------------------
// Ikoner (paper-exact størrelse: 11×9 checkmark, 10×10 X og info)
// ---------------------------------------------------------------------------

function CheckIcon() {
  return (
    <svg width="11" height="9" viewBox="0 0 11 9" fill="none" aria-hidden>
      <polyline
        points="1,4.5 4,7.5 10,1.5"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function XIconSmall() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
      <line x1="2" y1="2" x2="8" y2="8" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="2" x2="2" y2="8" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
      <line x1="5" y1="4.5" x2="5" y2="8" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="5" cy="2.5" r="0.75" fill="white" />
    </svg>
  );
}

function DismissIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <line x1="3" y1="3" x2="11" y2="11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="11" y1="3" x2="3" y2="11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
