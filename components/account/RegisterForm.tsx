'use client';

/**
 * RegisterForm — Paper ADX-1.
 *
 * Klient-island som POSTer til `/api/auth/register`. Serveren oppretter
 * en kunde via `wc/v3/customers` (WooCommerce REST) og gjør en auto-login
 * via chef-auth-pluginen slik at brukeren lander logget inn på /konto.
 *
 * Formen er pakket i `AuthFormCard` som eier tab-strip + header (H2
 * "Opprett konto" + subtitle med inline link til /konto/logg-inn).
 *
 * Felter (rekkefølge matcher Paper ADX-1):
 *   1. Fornavn + Etternavn (2-kol på md+, stack på mobil)
 *   2. E-postadresse
 *   3. Passord (min 8 tegn — hint under feltet)
 *   4. Bekreft passord
 *   5. Consent-checkbox med inline-lenker til vilkår + personvern
 *   6. Submit-knapp (aka)
 *
 * Klient-validering er tynn — serveren er sannheten. Vi sjekker:
 *   - Begge passord-feltene matcher (raskere feedback enn server round-trip)
 *   - Consent er huket av (serveren ville uansett avvist, men rød melding
 *     rett over knappen er mer pedagogisk enn en server-feilmelding)
 * Alt annet (e-post-format, min 8 tegn, eksisterende e-post) overlates
 * til serverens Zod + WC.
 */

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useId, useState, type FormEvent } from 'react';

import { track } from '@/lib/analytics';
import { AuthFormCard } from './AuthFormCard';
import {
  AUTH_ERROR_GENERIC,
  AUTH_ERROR_NETWORK,
  AUTH_ERROR_PASSWORD_MISMATCH,
  AUTH_ERROR_TERMS_REQUIRED,
  REGISTER_CONFIRM_PASSWORD_LABEL,
  REGISTER_CONSENT_AND,
  REGISTER_CONSENT_PREFIX,
  REGISTER_CONSENT_PRIVACY_HREF,
  REGISTER_CONSENT_PRIVACY_LABEL,
  REGISTER_CONSENT_TERMS_HREF,
  REGISTER_CONSENT_TERMS_LABEL,
  REGISTER_EMAIL_LABEL,
  REGISTER_EMAIL_PLACEHOLDER,
  REGISTER_FIRSTNAME_LABEL,
  REGISTER_HEADER_SUB_LINK,
  REGISTER_HEADER_SUB_PREFIX,
  REGISTER_HEADER_TITLE,
  REGISTER_LASTNAME_LABEL,
  REGISTER_LOGIN_HREF,
  REGISTER_PASSWORD_HINT,
  REGISTER_PASSWORD_LABEL,
  REGISTER_SUBMIT_LABEL,
  REGISTER_SUBMIT_PENDING_LABEL,
} from '@/lib/auth/info';

interface RegisterApiOk {
  readonly ok: true;
  readonly user: {
    readonly id: number;
    readonly email: string;
    readonly displayName: string;
    readonly roles: readonly string[];
  };
}
interface RegisterApiErr {
  readonly ok: false;
  readonly error: string;
}
type RegisterApiResponse = RegisterApiOk | RegisterApiErr;

export function RegisterForm() {
  const router = useRouter();

  const firstNameId = useId();
  const lastNameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const confirmPasswordId = useId();
  const consentId = useId();
  const errorId = useId();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [consent, setConsent] = useState(false);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;

    // Klient-validering — kjør før server-request.
    if (password !== confirmPassword) {
      setError(AUTH_ERROR_PASSWORD_MISMATCH);
      return;
    }
    if (!consent) {
      setError(AUTH_ERROR_TERMS_REQUIRED);
      return;
    }

    setPending(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          password,
          confirmPassword,
          consent,
        }),
        credentials: 'same-origin',
      });

      const data = (await safeJson(res)) as RegisterApiResponse | null;

      if (!res.ok || !data || data.ok === false) {
        setError(
          (data && data.ok === false && data.error) || AUTH_ERROR_GENERIC,
        );
        return;
      }

      // Analytics — `sign_up` er standard GA4-event-name. `method: 'email'`
      // matcher vokabularet fra login.
      try {
        track({ name: 'sign_up', payload: { method: 'email' } });
      } catch {
        // Analytics skal aldri blokkere navigasjon.
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('auth:changed'));
      }

      router.push('/konto');
      router.refresh();
    } catch {
      setError(AUTH_ERROR_NETWORK);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthFormCard
      activeTab="register"
      variant="register"
      title={REGISTER_HEADER_TITLE}
      subPrefix={REGISTER_HEADER_SUB_PREFIX}
      subLinkLabel={REGISTER_HEADER_SUB_LINK}
      subLinkHref={REGISTER_LOGIN_HREF}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-sp-4" noValidate>
        {error && (
          <div
            id={errorId}
            role="alert"
            aria-live="polite"
            className="rounded-1 border border-aka bg-aka/5 px-sp-3 py-sp-3 text-body-sm text-aka"
          >
            {error}
          </div>
        )}

        <div className="grid gap-sp-4 md:grid-cols-2">
          <TextField
            id={firstNameId}
            label={REGISTER_FIRSTNAME_LABEL}
            autoComplete="given-name"
            value={firstName}
            onChange={setFirstName}
            disabled={pending}
            required
          />
          <TextField
            id={lastNameId}
            label={REGISTER_LASTNAME_LABEL}
            autoComplete="family-name"
            value={lastName}
            onChange={setLastName}
            disabled={pending}
            required
          />
        </div>

        <TextField
          id={emailId}
          label={REGISTER_EMAIL_LABEL}
          type="email"
          autoComplete="email"
          placeholder={REGISTER_EMAIL_PLACEHOLDER}
          value={email}
          onChange={setEmail}
          disabled={pending}
          required
        />

        <div className="flex flex-col gap-sp-2">
          <label
            htmlFor={passwordId}
            className="text-label font-bold uppercase text-ink"
          >
            {REGISTER_PASSWORD_LABEL}
          </label>
          <input
            id={passwordId}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            disabled={pending}
            className="h-(--height-auth-input) w-full rounded-1 border border-divider bg-surface px-sp-3 text-body-md text-ink placeholder:text-ink-subtle focus:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <p className="text-body-xs text-ink-muted">{REGISTER_PASSWORD_HINT}</p>
        </div>

        <div className="flex flex-col gap-sp-2">
          <label
            htmlFor={confirmPasswordId}
            className="text-label font-bold uppercase text-ink"
          >
            {REGISTER_CONFIRM_PASSWORD_LABEL}
          </label>
          <input
            id={confirmPasswordId}
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            disabled={pending}
            className="h-(--height-auth-input) w-full rounded-1 border border-divider bg-surface px-sp-3 text-body-md text-ink placeholder:text-ink-subtle focus:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>

        <label
          htmlFor={consentId}
          className="flex cursor-pointer items-start gap-sp-2 text-body-sm text-ink-muted"
        >
          <input
            id={consentId}
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
            disabled={pending}
            className="mt-0.5 size-5 shrink-0 accent-aka"
          />
          <span>
            {REGISTER_CONSENT_PREFIX}{' '}
            <Link
              href={REGISTER_CONSENT_TERMS_HREF}
              className="text-ink underline underline-offset-4 hover:text-aka focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2"
            >
              {REGISTER_CONSENT_TERMS_LABEL}
            </Link>{' '}
            {REGISTER_CONSENT_AND}{' '}
            <Link
              href={REGISTER_CONSENT_PRIVACY_HREF}
              className="text-ink underline underline-offset-4 hover:text-aka focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2"
            >
              {REGISTER_CONSENT_PRIVACY_LABEL}
            </Link>
            .
          </span>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="mt-sp-1 flex h-(--height-auth-cta) w-full items-center justify-center rounded-1 bg-aka text-body-md font-bold text-shiro transition-colors hover:bg-aka-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? REGISTER_SUBMIT_PENDING_LABEL : REGISTER_SUBMIT_LABEL}
        </button>
      </form>
    </AuthFormCard>
  );
}

// ---------------------------------------------------------------------------
// TextField — delt base for Fornavn/Etternavn/E-post. Passord-felter bruker
// egen rendring fordi de har hint-tekst + ingen placeholder (Paper ADX-1).
// ---------------------------------------------------------------------------

interface TextFieldProps {
  readonly id: string;
  readonly label: string;
  readonly type?: 'text' | 'email';
  readonly autoComplete?: string;
  readonly placeholder?: string;
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly required?: boolean;
  readonly disabled?: boolean;
}

function TextField({
  id,
  label,
  type = 'text',
  autoComplete,
  placeholder,
  value,
  onChange,
  required,
  disabled,
}: TextFieldProps) {
  return (
    <div className="flex flex-col gap-sp-2">
      <label htmlFor={id} className="text-label font-bold uppercase text-ink">
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        className="h-(--height-auth-input) w-full rounded-1 border border-divider bg-surface px-sp-3 text-body-md text-ink placeholder:text-ink-subtle focus:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
