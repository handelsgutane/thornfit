'use client';

/**
 * LoginForm — Paper ALR-1 / AQT-1.
 *
 * Klient-island som POSTer til `/api/auth/login`. Serveren auth-er mot WPs
 * `chef-auth`-plugin (ADR-0003) og setter både `skn_auth`-ekvivalente WP-
 * cookies og `skn_user` (readable UI-state — se `lib/auth/session.ts`).
 *
 * Formen er pakket i `AuthFormCard` som selv eier tab-strip + header
 * (H2 "Velkommen tilbake" + subtitle med inline link til /konto/registrer).
 * Alt UI som ikke hører til skjemaets felter ligger altså utenfor denne
 * komponenten — LoginForm fokuserer på state, validering, submit og feil.
 *
 * UX-detaljer:
 *   - Submit er disabled mens requesten kjører for å unngå dobbelt-trykk.
 *   - Feil fra serveren vises over feltene i en `role="alert"` region — blir
 *     også annonsert via `aria-live="polite"` uten å avbryte skjermleseren.
 *   - Password-toggle (øye-ikon) viser/skjuler passord lokalt — rent UI.
 *   - "Husk meg" checkbox. Vi sender `remember: boolean` til serveren, men
 *     faktisk cookie-expiry kontrolleres av WP (`wp_set_auth_cookie` +
 *     `auth_cookie_expiration`-filter i chef-auth-pluginen). Vi passer kun
 *     hint-en; serveren er sannheten.
 *   - `router.push(returnUrl)` + `router.refresh()` etter suksess. Refresh
 *     tvinger RSCene (Header/Drawer) til å re-fetche session-user-cookien.
 *   - Analytics: fyrer `login` event via `track()`. Consent-check skjer
 *     inne i `track()`.
 *
 * Ikke-triggere vi bevisst IKKE håndterer her:
 *   - Passord-validering lokalt: serveren avgjør riktighet.
 *   - E-post-format-validering: HTML5 `type="email"` + Zod på server holder.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useState, useId, type FormEvent } from 'react';

import { track } from '@/lib/analytics';
import { AuthFormCard } from './AuthFormCard';
import {
  AUTH_ERROR_GENERIC,
  AUTH_ERROR_NETWORK,
  LOGIN_EMAIL_LABEL,
  LOGIN_EMAIL_PLACEHOLDER,
  LOGIN_FORGOT_PASSWORD_HREF,
  LOGIN_FORGOT_PASSWORD_LABEL,
  LOGIN_HEADER_SUB_LINK,
  LOGIN_HEADER_SUB_PREFIX,
  LOGIN_HEADER_TITLE,
  LOGIN_PASSWORD_LABEL,
  LOGIN_PASSWORD_PLACEHOLDER,
  LOGIN_REGISTER_HREF,
  LOGIN_REMEMBER_LABEL,
  LOGIN_SUBMIT_LABEL,
  LOGIN_SUBMIT_PENDING_LABEL,
} from '@/lib/auth/info';

interface LoginApiOk {
  readonly ok: true;
  readonly user: {
    readonly id: number;
    readonly email: string;
    readonly displayName: string;
    readonly roles: readonly string[];
  };
}
interface LoginApiErr {
  readonly ok: false;
  readonly error: string;
}
type LoginApiResponse = LoginApiOk | LoginApiErr;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();

  // `returnUrl` støttes så vi kan rute tilbake dit bruker kom fra etter
  // suksess (f.eks. fra /handlekurv hvis de klikket "Logg inn" i en banner).
  // Default: /konto.
  const returnUrl = sanitizeReturnUrl(params.get('returnUrl')) ?? '/konto';

  const emailId = useId();
  const passwordId = useId();
  const rememberId = useId();
  const errorId = useId();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;

    setPending(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, remember }),
        credentials: 'same-origin',
      });

      const data = (await safeJson(res)) as LoginApiResponse | null;

      if (!res.ok || !data || data.ok === false) {
        setError(
          (data && data.ok === false && data.error) || AUTH_ERROR_GENERIC,
        );
        return;
      }

      // Analytics — `method: 'email'` matcher vocabulary i events.ts.
      // Lander etter success, før nav — så tracking ikke tapes ved redirect.
      try {
        track({ name: 'login', payload: { method: 'email' } });
      } catch {
        // Analytics skal aldri blokkere navigasjon.
      }

      // Broadcast auth-change så andre åpne tabs / components kan reagere.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('auth:changed'));
      }

      router.push(returnUrl);
      // Refresh så Header/Drawer re-leser `skn_user`-cookien.
      router.refresh();
    } catch {
      setError(AUTH_ERROR_NETWORK);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthFormCard
      activeTab="login"
      variant="login"
      title={LOGIN_HEADER_TITLE}
      subPrefix={LOGIN_HEADER_SUB_PREFIX}
      subLinkLabel={LOGIN_HEADER_SUB_LINK}
      subLinkHref={LOGIN_REGISTER_HREF}
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

        <Field
          id={emailId}
          label={LOGIN_EMAIL_LABEL}
          type="email"
          autoComplete="email"
          placeholder={LOGIN_EMAIL_PLACEHOLDER}
          value={email}
          onChange={setEmail}
          required
          disabled={pending}
          ariaInvalid={Boolean(error)}
          ariaDescribedBy={error ? errorId : undefined}
        />

        <PasswordField
          id={passwordId}
          label={LOGIN_PASSWORD_LABEL}
          placeholder={LOGIN_PASSWORD_PLACEHOLDER}
          value={password}
          onChange={setPassword}
          show={showPassword}
          onToggleShow={() => setShowPassword((v) => !v)}
          disabled={pending}
          ariaInvalid={Boolean(error)}
          ariaDescribedBy={error ? errorId : undefined}
          forgotHref={LOGIN_FORGOT_PASSWORD_HREF}
          forgotLabel={LOGIN_FORGOT_PASSWORD_LABEL}
        />

        <label
          htmlFor={rememberId}
          className="flex cursor-pointer items-center gap-sp-2 text-body-sm text-ink-muted"
        >
          <input
            id={rememberId}
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            disabled={pending}
            // `accent-aka` er den eneste Tailwind-utility-en som farger
            // native checkbox gjennom token-systemet. Arbitrary-verdier
            // unngås.
            className="size-4 shrink-0 accent-aka"
          />
          <span>{LOGIN_REMEMBER_LABEL}</span>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="mt-sp-1 flex h-(--height-auth-cta) w-full items-center justify-center rounded-1 bg-aka text-body-md font-bold text-shiro transition-colors hover:bg-aka-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? LOGIN_SUBMIT_PENDING_LABEL : LOGIN_SUBMIT_LABEL}
        </button>
      </form>
    </AuthFormCard>
  );
}

/**
 * LoginFormSkeleton — rendres som Suspense-fallback i page.tsx under
 * prerender fordi `useSearchParams()` i LoginForm bail-ser ut av static
 * rendering. Skeletonen matcher den virkelige formens kort-dimensjoner
 * 1:1 så det ikke blir CLS når den virkelige formen hydrerer.
 */
export function LoginFormSkeleton() {
  return (
    <div
      aria-hidden
      className={[
        'w-full',
        'lg:max-w-[var(--width-auth-card-login)]',
        'rounded-2 border border-divider bg-surface',
        'shadow-[var(--shadow-auth-card-sm)] lg:shadow-[var(--shadow-auth-card)]',
        'px-[var(--padding-auth-card-x-sm)] py-[var(--padding-auth-card-y-sm)]',
        'lg:px-[var(--padding-auth-card-x)] lg:py-[var(--padding-auth-card-y)]',
      ].join(' ')}
    >
      {/* Tab-strip placeholder */}
      <div className="flex gap-sp-5 border-b border-divider">
        <div className="h-6 w-20 -mb-px border-b-2 border-aka bg-surface-muted rounded-t-1" />
        <div className="h-6 w-24 -mb-px bg-surface-muted/50 rounded-t-1" />
      </div>

      {/* Header placeholder */}
      <div className="mt-sp-5 mb-sp-5 flex flex-col gap-sp-2 lg:mt-sp-6 lg:mb-sp-6">
        <div className="h-8 w-3/5 rounded-1 bg-surface-muted lg:h-10" />
        <div className="h-4 w-2/3 rounded-1 bg-surface-muted" />
      </div>

      <div className="flex flex-col gap-sp-4">
        <SkeletonField />
        <SkeletonField />
        <div className="h-4 w-40 rounded-1 bg-surface-muted" />
        <div className="mt-sp-1 h-(--height-auth-cta) w-full rounded-1 bg-surface-muted" />
      </div>
    </div>
  );
}

function SkeletonField() {
  return (
    <div className="flex flex-col gap-sp-2">
      <div className="h-3 w-16 rounded-1 bg-surface-muted" />
      <div className="h-(--height-auth-input) w-full rounded-1 border border-divider bg-surface-muted" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field — label + input (base for text/email inputs)
// ---------------------------------------------------------------------------

interface FieldProps {
  readonly id: string;
  readonly label: string;
  readonly type: 'email' | 'text';
  readonly autoComplete: string;
  readonly placeholder: string;
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly ariaInvalid?: boolean;
  readonly ariaDescribedBy?: string;
}

function Field({
  id,
  label,
  type,
  autoComplete,
  placeholder,
  value,
  onChange,
  required,
  disabled,
  ariaInvalid,
  ariaDescribedBy,
}: FieldProps) {
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
        aria-invalid={ariaInvalid || undefined}
        aria-describedby={ariaDescribedBy}
        className="h-(--height-auth-input) w-full rounded-1 border border-divider bg-surface px-sp-3 text-body-md text-ink placeholder:text-ink-subtle focus:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// PasswordField — label-row med inline "Glemt passord?" + eye-toggle
// ---------------------------------------------------------------------------

interface PasswordFieldProps {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly show: boolean;
  readonly onToggleShow: () => void;
  readonly disabled?: boolean;
  readonly ariaInvalid?: boolean;
  readonly ariaDescribedBy?: string;
  readonly forgotHref: string;
  readonly forgotLabel: string;
}

function PasswordField({
  id,
  label,
  placeholder,
  value,
  onChange,
  show,
  onToggleShow,
  disabled,
  ariaInvalid,
  ariaDescribedBy,
  forgotHref,
  forgotLabel,
}: PasswordFieldProps) {
  return (
    <div className="flex flex-col gap-sp-2">
      {/* Paper-mønster: label venstre, "Glemt passord?" inline høyre.
          Vi bruker en flex-row med justify-between for å holde dem på
          samme baseline. */}
      <div className="flex items-baseline justify-between gap-sp-3">
        <label
          htmlFor={id}
          className="text-label font-bold uppercase text-ink"
        >
          {label}
        </label>
        <Link
          href={forgotHref}
          className="text-body-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2"
        >
          {forgotLabel}
        </Link>
      </div>

      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          autoComplete="current-password"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          disabled={disabled}
          aria-invalid={ariaInvalid || undefined}
          aria-describedby={ariaDescribedBy}
          className="h-(--height-auth-input) w-full rounded-1 border border-divider bg-surface px-sp-3 pr-12 text-body-md text-ink placeholder:text-ink-subtle focus:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <div className="absolute right-sp-2 top-1/2 -translate-y-1/2">
          <button
            type="button"
            onClick={onToggleShow}
            aria-label={show ? 'Skjul passord' : 'Vis passord'}
            aria-pressed={show}
            className="flex size-8 items-center justify-center rounded-1 text-ink-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-aka"
          >
            <EyeIcon open={show} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Eye icon — matcher Paper password-toggle
// ---------------------------------------------------------------------------

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path
          d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M2 10s3-6 8-6c1.5 0 2.8.4 4 1M18 10s-3 6-8 6c-1.5 0-2.8-.4-4-1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M3 3l14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
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

/**
 * Tillat kun interne paths som returnUrl — open-redirect-beskyttelse. Hvis
 * verdien ikke starter med '/' (eller starter med '//' som er protokoll-
 * relativ URL) returnerer vi null slik at default-banen brukes.
 */
function sanitizeReturnUrl(v: string | null): string | null {
  if (!v) return null;
  if (!v.startsWith('/')) return null;
  if (v.startsWith('//')) return null;
  // Unngå at en angriper stuffer JS i URL via javascript:/data: (paranoid)
  if (v.includes(':')) return null;
  return v;
}
