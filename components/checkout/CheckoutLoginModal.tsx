/**
 * CheckoutLoginModal — modal som åpnes fra "Logg inn"-knappen i
 * AccountPrompt-banneret på checkout (Paper GWW-0).
 *
 * Innhold:
 *   • Header (GWX-0/GWY-0): To-tab navigasjon "Logg inn" / "Registrer deg".
 *     Aktiv tab har 2px aka under-border, inaktiv er muted med transparent
 *     border. Lukk-X (GX3-0) i øvre høyre hjørne.
 *   • Divider 1px sakai (GX6-0).
 *   • Body (GX7-0): pt 28, pb 32, px 28, gap 20.
 *     - Info-banner (GX8-0): bg canvas, padding 12/16, gap 10. Bruker-ikon
 *       + 13/20 haiiro tekst.
 *     - E-post-felt: 11/14 bold kuro 0.1em uppercase label + input
 *       (border 1.5 ink når aktiv, ellers 1 sakai).
 *     - Passord-felt: label-row med "Glemt passord?"-link til høyre +
 *       input med vis-toggle.
 *     - Husk meg-rad: 16×16 checkbox + 13/16 label.
 *     - Logg inn-CTA: bg aka, py 15 px 15, 15/18 bold shiro 0.01em.
 *     - Eller-divider: linjer 189px sakai + "eller" 12/16 haiiro.
 *     - Fortsett som gjest-knapp: border 1.5 ink, py 13 px 13, 14/18 bold.
 *
 * "Registrer deg"-tab aktiveres via klikk og navigerer brukeren til
 * /konto/registrer?redirect=/checkout (samme route som AuthShell-en).
 *
 * Login-flow bruker eksisterende /api/auth/login-endpoint (samme som
 * LoginForm). Ved suksess: lukker modalen og refresher checkout-siden så
 * server-prefill kicker inn.
 */

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';

import { Toast, useToast } from '@/components/ui/Toast';

interface CheckoutLoginModalProps {
  open: boolean;
  onClose: () => void;
  onContinueAsGuest: () => void;
}

export function CheckoutLoginModal({
  open,
  onClose,
  onContinueAsGuest,
}: CheckoutLoginModalProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { toastProps, showToast } = useToast();
  const emailRef = useRef<HTMLInputElement>(null);
  const dialogId = useId();

  // Focus email when modal opens; lock body-scroll while open.
  useEffect(() => {
    if (!open) return;
    emailRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password, remember }),
        });
        const body = (await res.json().catch(() => null)) as
          | { ok: boolean; error?: string }
          | null;
        if (!res.ok || !body?.ok) {
          setError(body?.error ?? 'Feil e-post eller passord.');
          return;
        }
        showToast({ variant: 'success', message: 'Du er nå logget inn.' });
        onClose();
        router.refresh();
      } catch {
        setError('Noe gikk galt. Prøv igjen.');
      }
    });
  }

  function handleRegisterTab() {
    router.push('/konto/registrer?redirect=/checkout');
  }

  return (
    <>
      {/* Overlay (GWV-0): 50% black */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${dialogId}-title`}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" /* paper-exact: GWV-0 (overlay #00000080) */
      >
        {/* Click outside dismisses */}
        <div className="absolute inset-0" onClick={onClose} aria-hidden />

        {/* Modal (GWW-0): 480px wide, radius 2 */}
        <div
          className="relative flex w-full max-w-[480px] flex-col overflow-clip rounded-1 bg-surface" /* paper-exact: GWW-0 (480 wide) */
        >
          {/* Header (GWX-0): pt 24 px 28 */}
          <div className="flex items-center justify-between px-7 pt-6" /* paper-exact: GWX-0 */>
            {/* Tabs (GWY-0): items-end gap 0 */}
            <div className="flex items-end" /* paper-exact: GWY-0 */>
              <button
                type="button"
                aria-pressed="true"
                id={`${dialogId}-title`}
                className="mr-6 border-b-2 border-aka pb-3 font-bold text-ink" /* paper-exact: GWZ-0 (active tab, 2px aka under-border, mr 24, pb 12) */
                style={{ fontSize: '15px', lineHeight: '18px' }} /* paper-exact: GX0-0 (15/18 bold) */
              >
                Logg inn
              </button>
              <button
                type="button"
                onClick={handleRegisterTab}
                className="border-b-2 border-transparent pb-3 font-medium text-ink-muted hover:text-ink" /* paper-exact: GX1-0 (transparent border-bottom 2px, pb 12) */
                style={{ fontSize: '15px', lineHeight: '18px' }} /* paper-exact: GX2-0 (15/18 medium haiiro) */
              >
                Registrer deg
              </button>
            </div>

            {/* Close X (GX3-0): 32×32, mb 12 */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Lukk"
              className="-mr-1 mb-3 flex size-8 shrink-0 items-center justify-center text-ink hover:text-aka" /* paper-exact: GX3-0 (32×32 mb 12) */
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <path
                  d="M3 3L13 13M13 3L3 13"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {/* Divider (GX6-0): 1px sakai mx 28 */}
          <div className="mx-7 h-px bg-divider" /* paper-exact: GX6-0 */ aria-hidden />

          {/* Body (GX7-0): pt 28 pb 32 px 28 gap 20 */}
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-5 px-7 pt-7 pb-8" /* paper-exact: GX7-0 (pt 28 pb 32 px 28 gap 20) */
          >
            {/* Info-banner (GX8-0): bg canvas, padding 12/16, gap 10 */}
            <div className="flex items-start gap-2.5 rounded-1 bg-canvas px-4 py-3" /* paper-exact: GX8-0 */>
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden
                className="mt-0.5 shrink-0 text-ink-muted"
              >
                <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
                <path
                  d="M3 13.5C3 11.5 5 10 8 10s5 1.5 5 3.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
              <p
                className="text-ink-muted"
                style={{ fontSize: '13px', lineHeight: '20px' }} /* paper-exact: GXD-0 (13/20 haiiro) */
              >
                Logg inn for forhåndsutfylt adresse, ordrehistorikk og raskere
                utsjekking.
              </p>
            </div>

            {/* E-post-felt (GXE-0): col gap 6 */}
            <label className="flex flex-col gap-1.5" /* paper-exact: GXE-0 (gap 6) */>
              <span
                className="font-bold uppercase text-ink"
                style={{ fontSize: '11px', lineHeight: '14px', letterSpacing: '0.1em' }} /* paper-exact: GXF-0 */
              >
                E-postadresse
              </span>
              <input
                ref={emailRef}
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ola@eksempel.no"
                className="rounded-1 border-[1.5px] border-ink bg-surface px-3.5 py-3 text-ink placeholder:text-ink-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2" /* paper-exact: GXG-0 (border 1.5 ink, py 12 px 14) */
                style={{ fontSize: '14px', lineHeight: '18px' }} /* paper-exact: GXH-0 (14/18 regular) */
              />
            </label>

            {/* Passord-felt (GXI-0) */}
            <div className="flex flex-col gap-1.5" /* paper-exact: GXI-0 (gap 6) */>
              <div className="flex items-center justify-between" /* paper-exact: GXJ-0 */>
                <label
                  htmlFor={`${dialogId}-password`}
                  className="font-bold uppercase text-ink"
                  style={{ fontSize: '11px', lineHeight: '14px', letterSpacing: '0.1em' }} /* paper-exact: GXK-0 */
                >
                  Passord
                </label>
                <Link
                  href="/konto/glemt-passord"
                  className="font-medium text-ink-muted underline transition-colors hover:text-ink" /* paper-exact: GXL-0 (12/16 medium haiiro underline) */
                  style={{ fontSize: '12px', lineHeight: '16px' }}
                >
                  Glemt passord?
                </Link>
              </div>
              <div className="flex items-center justify-between rounded-1 border border-divider bg-surface px-3.5 py-3 focus-within:border-ink" /* paper-exact: GXM-0 (border 1 sakai, py 12 px 14) */>
                <input
                  id={`${dialogId}-password`}
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="flex-1 bg-transparent text-ink focus:outline-none"
                  style={{ fontSize: '16px', lineHeight: '20px' }} /* paper-exact: GXN-0 (16/20) */
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Skjul passord' : 'Vis passord'}
                  className="ml-sp-2 shrink-0 text-ink-muted hover:text-ink"
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                      <path d="M2 9s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.5" />
                      <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M3 3l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                      <path d="M2 9s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.5" />
                      <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Husk meg-rad (GXS-0): gap 10 */}
            <label className="flex cursor-pointer items-center gap-2.5" /* paper-exact: GXS-0 */>
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="size-4 cursor-pointer accent-aka" /* paper-exact: GXT-0 (16×16) */
              />
              <span
                className="text-ink"
                style={{ fontSize: '13px', lineHeight: '16px' }} /* paper-exact: GXU-0 (13/16 regular) */
              >
                Husk meg på denne enheten
              </span>
            </label>

            {error && (
              <p
                role="alert"
                className="text-aka"
                style={{ fontSize: '13px', lineHeight: '16px' }}
              >
                {error}
              </p>
            )}

            {/* Logg inn-CTA (GXV-0): bg aka py 15 px 15 */}
            <button
              type="submit"
              disabled={pending}
              className="flex items-center justify-center rounded-1 bg-aka px-3.5 py-3.5 font-bold text-shiro transition-opacity hover:opacity-90 disabled:opacity-60" /* paper-exact: GXV-0 (py 15 px 15) */
              style={{ fontSize: '15px', lineHeight: '18px', letterSpacing: '0.01em' }} /* paper-exact: GXW-0 (15/18 bold 0.01em) */
            >
              {pending ? 'Logger inn…' : 'Logg inn'}
            </button>

            {/* Eller-divider (GXX-0): items-center gap 12 */}
            <div className="flex items-center gap-3" /* paper-exact: GXX-0 */>
              <span className="h-px flex-1 bg-divider" aria-hidden />
              <span
                className="shrink-0 text-ink-muted"
                style={{ fontSize: '12px', lineHeight: '16px' }} /* paper-exact: GXZ-0 */
              >
                eller
              </span>
              <span className="h-px flex-1 bg-divider" aria-hidden />
            </div>

            {/* Fortsett som gjest (GY1-0): border 1.5 ink, py 13 px 13 */}
            <button
              type="button"
              onClick={() => {
                onContinueAsGuest();
                onClose();
              }}
              className="flex items-center justify-center rounded-1 border-[1.5px] border-ink bg-surface py-3 font-bold text-ink transition-colors hover:bg-canvas" /* paper-exact: GY1-0 (border 1.5 ink, py 13) */
              style={{ fontSize: '14px', lineHeight: '18px' }} /* paper-exact: GY2-0 (14/18 bold) */
            >
              Fortsett som gjest
            </button>
          </form>
        </div>
      </div>
      {toastProps && <Toast {...toastProps} />}
    </>
  );
}
