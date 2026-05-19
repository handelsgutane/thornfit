/**
 * AccountPrompt — "Har du konto?"-banner som vises øverst i checkout-formen
 * når brukeren er utlogget.
 *
 * Paper-ref: 5MI-0 GO9-0 (820×71 desktop). Mobile-versjonen brytes til
 * stablet layout siden 358px viewport ikke har plass til ikon + tekst +
 * "Fortsett som gjest" + "Logg inn"-knapp på samme rad.
 *
 * Layout-spec:
 *   • Outer card (GO9-0): py 16, px 20, gap 24, border 1 sakai, radius 2,
 *     bg shiro, items-center, justify-between
 *   • Left col (GOA-0): icon-circle 36×36 canvas + text-col gap 2
 *     - Tittel (GOH-0): "Har du konto?" 14/18 bold kuro -0.01em
 *     - Subtittel (GOI-0): 13/16 regular haiiro
 *   • Right col (GOJ-0): gap 12
 *     - "Fortsett som gjest" (GOK-0): 13/16 medium haiiro (link)
 *     - "Logg inn"-button (GOL-0): py 9 px 20, border 1.5 ink, radius 2
 *       - Tekst (GOM-0): 13/16 bold ink
 *
 * "Fortsett som gjest" har ingen handling i Paper — det er et UI-cue om at
 * bruker IKKE må logge inn (default-flow er gjest). Implementert som passiv
 * tekst-link som ruller fokus til e-post-feltet, så det føles handlingsrik
 * uten å kreve auth-state-toggle.
 */

'use client';

import { useState } from 'react';

import { CheckoutLoginModal } from './CheckoutLoginModal';

interface AccountPromptProps {
  /** Beholdes for backward-compat — hvis brukerene ønsker fallback-navigasjon
   *  til /konto/logg-inn-siden i stedet for modalen, kan denne brukes. */
  returnTo?: string;
  className?: string;
}

export function AccountPrompt({ returnTo: _returnTo = '/checkout', className }: AccountPromptProps) {
  const [modalOpen, setModalOpen] = useState(false);

  function focusContactEmail() {
    if (typeof document === 'undefined') return;
    const input = document.querySelector<HTMLInputElement>('input[type="email"]');
    input?.focus();
    input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <aside
      aria-label="Logg inn for forhåndsutfylt adresse"
      className={[
        'flex flex-col items-stretch gap-3 rounded-1 border border-divider bg-surface px-4 py-3.5',
        'md:flex-row md:items-center md:justify-between md:gap-sp-4 md:px-5 md:py-sp-3', /* paper-exact: GO9-0 (desktop py 16 px 20 gap 24) */
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Left col: icon + text */}
      <div className="flex items-center gap-3 md:gap-sp-3" /* paper-exact: GOA-0 (gap 16) */>
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-canvas text-ink-muted" /* paper-exact: GOB-0 (36×36 canvas circle) */
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
            <path
              d="M3 13.5C3 11.5 5 10 8 10s5 1.5 5 3.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <div className="flex flex-col gap-0.5" /* paper-exact: GOG-0 (col gap 2) */>
          <span
            className="font-bold text-ink"
            style={{ fontSize: '14px', lineHeight: '18px', letterSpacing: '-0.01em' }} /* paper-exact: GOH-0 (14/18 bold -0.01em) */
          >
            Har du konto?
          </span>
          <span
            className="text-ink-muted"
            style={{ fontSize: '13px', lineHeight: '16px' }} /* paper-exact: GOI-0 (13/16 regular haiiro) */
          >
            Logg inn for forhåndsutfylt adresse, ordrehistorikk og raskere
            utsjekking.
          </span>
        </div>
      </div>

      {/* Right col: actions */}
      <div className="flex shrink-0 items-center justify-end gap-3" /* paper-exact: GOJ-0 (gap 12) */>
        <button
          type="button"
          onClick={focusContactEmail}
          className="font-medium text-ink-muted transition-colors hover:text-ink" /* paper-exact: GOK-0 (13/16 medium haiiro) */
          style={{ fontSize: '13px', lineHeight: '16px' }}
        >
          Fortsett som gjest
        </button>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex shrink-0 items-center justify-center rounded-1 border-[1.5px] border-ink bg-surface px-5 py-2 font-bold text-ink transition-colors hover:bg-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2" /* paper-exact: GOL-0 (border 1.5 ink, py 9 px 20) */
          style={{ fontSize: '13px', lineHeight: '16px' }} /* paper-exact: GOM-0 (13/16 bold ink) */
        >
          Logg inn
        </button>
      </div>

      <CheckoutLoginModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onContinueAsGuest={focusContactEmail}
      />
    </aside>
  );
}
