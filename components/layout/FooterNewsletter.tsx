'use client';

/**
 * FooterNewsletter — e-postpåmelding i footer, Paper 2AO-0/2AR-0.
 *
 * Status: VISUELL STUB. Skjemaet renderer riktig, men submit er ikke koblet
 * til backend. Submit preventer default og viser en placeholder-takkemelding.
 *
 * TODO (backend-integrasjon): Når vi har valgt newsletter-provider (sannsynlig
 * kandidater: Klaviyo, Mailchimp, eller WooCommerce-integrasjon via Automattic
 * Newsletter), wire opp `handleSubmit` til å poste mot `/api/newsletter/subscribe`.
 * Server-routen trenger:
 *   - HMAC-validering hvis provider støtter webhook confirm
 *   - GDPR double-opt-in (send confirmation-mail med token, ikke automatisk approve)
 *   - Rate-limit via Upstash — 5 req/min per IP (anti-bot)
 *   - Honeypot-felt (usynlig input) — bots fyller ut, mennesker ikke
 *
 * Paper-refs:
 *   - 2AP-0 Heading "Nyhetsbrev" — 13px/18 uppercase, tracking 0.08em, F5F5F3
 *   - 2AQ-0 Subtekst — 14px Satoshi, haiiro (6B6B65)
 *   - 2AS-0 Input — h-44, bg #2A2520, border-t/l/b #3E3A39 (ingen right-border
 *                    så input fusjonerer inn i knappen visuelt)
 *   - 2AT-0 Knapp — h-44, bg aka (#EA5532 i Paper, vi bruker brand Aka #FF3333
 *                    for konsistens med resten av CTA-er)
 *   - 2AU-0 Knapp-tekst — "Meld meg på", 13px Satoshi, hvit
 *
 * Styling:
 *   - Input bruker font-fixed mørk farge (footer er alltid dark). CSS-vars
 *     --color-footer-input-bg/-border er brand-tokens, ikke semantic.
 *   - Fokus-ring på input bruker Aka så brukeren ser interaksjon på den
 *     mørke bakgrunnen (default browser-fokusring er ofte for svak her).
 */

import { useState, type FormEvent } from 'react';

export function FooterNewsletter() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitted' | 'error'>('idle');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // TODO: Koble mot /api/newsletter/subscribe. I dag gir vi kun UI-feedback
    // slik at designet kan reviewes. Rydd opp setTimeout når ekte wire-up
    // kommer — bruk fetch() med loading-state da.
    if (!email.trim() || !email.includes('@')) {
      setStatus('error');
      return;
    }
    setStatus('submitted');
  }

  return (
    <div className="flex w-full max-w-85 flex-col gap-sp-2 md:ml-auto">
      <h3
        className={[
          'uppercase tracking-[0.08em]' /* paper-exact: 2AP-0 tracking 0.08em */,
          'text-body-xs font-medium text-unohana',
        ].join(' ')}
      >
        Nyhetsbrev
      </h3>
      <p className="text-body-sm text-haiiro">
        Nye produkter, vedlikeholdstips og sesongguider — direkte i innboksen.
      </p>
      <form
        onSubmit={handleSubmit}
        className="mt-sp-1 flex"
        noValidate
        aria-label="Meld meg på nyhetsbrev"
      >
        <label htmlFor="footer-newsletter-email" className="sr-only">
          E-postadresse
        </label>
        <input
          id="footer-newsletter-email"
          type="email"
          required
          autoComplete="email"
          placeholder="E-post"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (status !== 'idle') setStatus('idle');
          }}
          className={[
            'h-11 grow shrink basis-0 px-sp-3' /* paper-exact: 2AS-0 h-44 */,
            'border-y border-l border-footer-input-border bg-footer-input-bg',
            'text-body-sm text-unohana placeholder:text-haiiro',
            'focus:outline-none focus-visible:border-aka focus-visible:ring-1 focus-visible:ring-aka',
          ].join(' ')}
          aria-invalid={status === 'error'}
          aria-describedby={status !== 'idle' ? 'footer-newsletter-status' : undefined}
        />
        <button
          type="submit"
          className={[
            'h-11 shrink-0 px-sp-4' /* paper-exact: 2AT-0 h-44, px 20 */,
            'bg-aka text-body-xs font-medium tracking-[0.04em] text-white' /* paper-exact: 2AU-0 tracking 0.04em */,
            'transition-colors hover:bg-aka-dark',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2 focus-visible:ring-offset-kuro',
          ].join(' ')}
        >
          Meld meg på
        </button>
      </form>
      {status !== 'idle' && (
        <p
          id="footer-newsletter-status"
          role={status === 'error' ? 'alert' : 'status'}
          className={[
            'text-muted-sm',
            status === 'error' ? 'text-aka' : 'text-haiiro-light',
          ].join(' ')}
        >
          {status === 'error'
            ? 'Vennligst skriv inn en gyldig e-postadresse.'
            : 'Takk! Vi har notert e-posten din. (Stub — ikke koblet til provider ennå.)'}
        </p>
      )}
    </div>
  );
}
