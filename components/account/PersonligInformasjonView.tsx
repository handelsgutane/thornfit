'use client';

/**
 * PersonligInformasjonView — `/konto/personlig-informasjon` (Paper 6GP-0
 * desktop / 7UT-0 mobile).
 *
 * To stablede card-er (Profilbilde og Fødselsdato fjernet — se notisen i
 * `lib/account/info.ts`):
 *   1. **Personalia** — Fornavn / Etternavn alltid 2-kolonne, E-post / Telefon
 *      2-kolonne på desktop og stablet på mobil. Primary CTA `Lagre endringer`
 *      høyre-justert på desktop, full-bredde på mobil.
 *   2. **Passord** — Nåværende / Nytt / Bekreft i 3-kolonne på desktop og
 *      stablet på mobil. Outline CTA `Endre passord`.
 *
 * ## Hvorfor klient-island?
 *   Form-state, validering og submit kjører på klienten. Submit-handlerne
 *   POSTer til `/api/auth/profile` og `/api/auth/password` (begge proxer mot
 *   Woo customers REST som workaround inntil chef-auth-pluginen får
 *   tilsvarende endpoints). Etter en vellykket profile-update kaller vi
 *   `router.refresh()` slik at AccountShell-headeren plukker opp ny
 *   `displayName` fra `skn_user`-cookien som routen skrev.
 *
 * ## Komponenter brukt
 *   - `Button` (components/ui/Button) — alle CTA-er. Variant `primary`/`outline`,
 *     responsive via to instanser (lg-skjult vs hidden lg-vist).
 *
 * ## Design-token-bruk
 *   - Card: `rounded-1 border-divider bg-surface px-sp-3 py-sp-4 lg:p-sp-4`
 *     2px radius (Paper 6UZ-0/6VR-0 desktop). Mobil-artboard 80B-0/811-0
 *     viser 4px, men det er en Paper-inkonsistens — vi bruker 2px overalt
 *     for å matche desktop + inputs + CTA. Padding: 16/20 mobile, 24/24 desktop.
 *   - Section-label "PERSONALIA" / "PASSORD": `text-label-sm` (10px) på mobil,
 *     `text-label` (11px) på desktop. `font-bold uppercase text-ink-muted`.
 *   - Field-label: `text-muted-sm font-bold text-ink` (12px bold). Tokenet
 *     heter `muted-sm` av historiske grunner — størrelsen matcher Paper og
 *     fargen styres separat via `text-ink`.
 *   - Input: `--height-auth-input` (48px), `rounded-1` (2px — Paper 6V4-0),
 *     `border-divider`. Visuelt identisk med Login/Register-inputene.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';

import { Toast, useToast, type ToastOptions } from '@/components/ui/Toast';

import {
  PROFILE_BACK_LABEL,
  PROFILE_FORM_EMAIL_LABEL,
  PROFILE_FORM_FIRST_NAME_LABEL,
  PROFILE_FORM_LAST_NAME_LABEL,
  PROFILE_FORM_PHONE_LABEL,
  PROFILE_FORM_PHONE_PLACEHOLDER,
  PROFILE_FORM_SAVE_ERROR,
  PROFILE_FORM_SAVE_LABEL,
  PROFILE_FORM_SAVE_PENDING_LABEL,
  PROFILE_FORM_SAVE_SUCCESS,
  PROFILE_PASSWORD_CONFIRM_LABEL,
  PROFILE_PASSWORD_CURRENT_LABEL,
  PROFILE_PASSWORD_ERROR,
  PROFILE_PASSWORD_LABEL,
  PROFILE_PASSWORD_MISMATCH,
  PROFILE_PASSWORD_NEW_LABEL,
  PROFILE_PASSWORD_PLACEHOLDER,
  PROFILE_PASSWORD_SUBMIT_LABEL,
  PROFILE_PASSWORD_SUBMIT_PENDING_LABEL,
  PROFILE_PASSWORD_SUCCESS,
  PROFILE_PERSONALIA_LABEL,
  PROFILE_TITLE,
} from '@/lib/account/info';
import type { AuthUser } from '@/lib/auth/session';
import { cn } from '@/lib/utils/cn';

import { Button, type ButtonVariant } from '@/components/ui/Button';

interface PersonligInformasjonViewProps {
  readonly user: AuthUser;
}

export function PersonligInformasjonView({
  user,
}: PersonligInformasjonViewProps) {
  const { toastProps, showToast } = useToast();

  return (
    <>
      <MobileSubHeader />
      <DesktopHeader />

      <div className="flex flex-col gap-sp-4 lg:gap-sp-5">
        <PersonaliaCard user={user} showToast={showToast} />
        <PasswordCard showToast={showToast} />
      </div>

      {toastProps && <Toast {...toastProps} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

function MobileSubHeader() {
  return (
    <header className="-mx-sp-3 -mt-sp-5 flex items-center gap-sp-3 border-b border-divider bg-surface px-sp-5 py-sp-3 md:-mx-sp-7 lg:hidden">
      <Link
        href="/konto"
        aria-label={PROFILE_BACK_LABEL}
        className="flex size-5 shrink-0 items-center justify-center text-ink"
      >
        <BackChevron />
      </Link>
      <h1 className="grow text-h4 font-bold text-ink">{PROFILE_TITLE}</h1>
    </header>
  );
}

function DesktopHeader() {
  return (
    <header className="hidden flex-col gap-sp-1 pb-sp-4 lg:flex">
      <h1 className="text-h2 font-bold text-ink">{PROFILE_TITLE}</h1>
    </header>
  );
}

function BackChevron() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Personalia card — Paper 6UZ-0 (desktop) / 80B-0 (mobile)
// ---------------------------------------------------------------------------

function PersonaliaCard({
  user,
  showToast,
}: {
  user: AuthUser;
  showToast: (opts: ToastOptions) => void;
}) {
  const router = useRouter();
  const initial = splitDisplayName(user.displayName);
  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState('');
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;

    setPending(true);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim(),
        }),
        credentials: 'same-origin',
      });

      const body = (await res.json().catch(() => null)) as
        | { ok: boolean; error?: string }
        | null;

      if (!res.ok || !body?.ok) {
        showToast({ variant: 'error', message: body?.error ?? PROFILE_FORM_SAVE_ERROR });
        return;
      }

      showToast({ variant: 'success', message: PROFILE_FORM_SAVE_SUCCESS });
      // Refresh server-state slik at AccountShell-headeren / sidebar plukker
      // opp ny displayName fra `skn_user`-cookien som routen oppdaterte.
      router.refresh();
    } catch {
      showToast({ variant: 'error', message: PROFILE_FORM_SAVE_ERROR });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="flex flex-col gap-sp-4" noValidate>
        <SectionLabel>{PROFILE_PERSONALIA_LABEL}</SectionLabel>

        {/* Fornavn / Etternavn — alltid 2-kolonne (også mobil per Paper 80B-0) */}
        <div className="flex gap-sp-3 lg:gap-sp-4">
          <FormField
            label={PROFILE_FORM_FIRST_NAME_LABEL}
            type="text"
            autoComplete="given-name"
            value={firstName}
            onChange={setFirstName}
            disabled={pending}
            className="grow basis-0"
          />
          <FormField
            label={PROFILE_FORM_LAST_NAME_LABEL}
            type="text"
            autoComplete="family-name"
            value={lastName}
            onChange={setLastName}
            disabled={pending}
            className="grow basis-0"
          />
        </div>

        {/* E-post / Telefon — desktop 2-kol, mobil stablet */}
        <div className="flex flex-col gap-sp-4 lg:flex-row lg:gap-sp-4">
          <FormField
            label={PROFILE_FORM_EMAIL_LABEL}
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            disabled={pending}
            className="grow basis-0"
          />
          <FormField
            label={PROFILE_FORM_PHONE_LABEL}
            type="tel"
            autoComplete="tel"
            placeholder={PROFILE_FORM_PHONE_PLACEHOLDER}
            value={phone}
            onChange={setPhone}
            disabled={pending}
            className="grow basis-0"
          />
        </div>

        <FormCta
          variant="primary"
          pending={pending}
          label={PROFILE_FORM_SAVE_LABEL}
          pendingLabel={PROFILE_FORM_SAVE_PENDING_LABEL}
        />
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Passord card — Paper 6VR-0 (desktop) / 811-0 (mobile)
// ---------------------------------------------------------------------------

function PasswordCard({ showToast }: { showToast: (opts: ToastOptions) => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [mismatchError, setMismatchError] = useState(false);

  const errorId = useId();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;

    setMismatchError(false);

    if (next !== confirm) {
      setMismatchError(true);
      return;
    }

    setPending(true);
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current, next }),
        credentials: 'same-origin',
      });

      const body = (await res.json().catch(() => null)) as
        | { ok: boolean; error?: string }
        | null;

      if (!res.ok || !body?.ok) {
        showToast({ variant: 'error', message: body?.error ?? PROFILE_PASSWORD_ERROR });
        return;
      }

      showToast({ variant: 'success', message: PROFILE_PASSWORD_SUCCESS });
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch {
      showToast({ variant: 'error', message: PROFILE_PASSWORD_ERROR });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="flex flex-col gap-sp-4" noValidate>
        <SectionLabel>{PROFILE_PASSWORD_LABEL}</SectionLabel>

        {/* Passord-mismatch er inline validering — Banner, ikke Toast */}
        {mismatchError && (
          <Banner id={errorId} tone="error">
            {PROFILE_PASSWORD_MISMATCH}
          </Banner>
        )}

        <div className="flex flex-col gap-sp-4 lg:flex-row lg:gap-sp-4">
          <FormField
            label={PROFILE_PASSWORD_CURRENT_LABEL}
            type="password"
            autoComplete="current-password"
            placeholder={PROFILE_PASSWORD_PLACEHOLDER}
            value={current}
            onChange={setCurrent}
            disabled={pending}
            className="grow basis-0"
          />
          <FormField
            label={PROFILE_PASSWORD_NEW_LABEL}
            type="password"
            autoComplete="new-password"
            placeholder={PROFILE_PASSWORD_PLACEHOLDER}
            value={next}
            onChange={setNext}
            disabled={pending}
            className="grow basis-0"
          />
          <FormField
            label={PROFILE_PASSWORD_CONFIRM_LABEL}
            type="password"
            autoComplete="new-password"
            placeholder={PROFILE_PASSWORD_PLACEHOLDER}
            value={confirm}
            onChange={setConfirm}
            disabled={pending}
            className="grow basis-0"
          />
        </div>

        <FormCta
          variant="outline"
          pending={pending}
          label={PROFILE_PASSWORD_SUBMIT_LABEL}
          pendingLabel={PROFILE_PASSWORD_SUBMIT_PENDING_LABEL}
        />
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shared building blocks (lokale per "ikke ekstrahere primitiv før 3. instans")
// ---------------------------------------------------------------------------

function Card({ children }: { children: React.ReactNode }) {
  // Paper 6UZ-0 / 6VR-0 (desktop): padding 24px / 24px → `p-sp-4`.
  // Paper 80B-0 / 811-0 (mobile): padding 16px H / 20px V. Mobil bruker
  // `px-sp-3` (16px) eksakt; vertikal `py-sp-4` (24px) ligger 4px over Paper-
  // verdien siden vi ikke har et 20px-token i spacing-skalaen — kommentert
  // i `app/globals.css` som bevisst valg.
  return (
    <section className="rounded-1 border border-divider bg-surface px-sp-3 py-sp-4 lg:p-sp-4">
      {children}
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-label-sm font-bold uppercase text-ink-muted lg:text-label">
      {children}
    </span>
  );
}

function Banner({
  id,
  tone,
  children,
}: {
  id?: string;
  tone: 'error' | 'success';
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      className={cn(
        'rounded-1 px-sp-3 py-sp-3 text-body-sm',
        tone === 'error'
          ? 'border border-aka bg-aka/5 text-aka'
          : 'border border-divider bg-surface-muted text-ink',
      )}
    >
      {children}
    </div>
  );
}

interface FormFieldProps {
  readonly label: string;
  readonly type: 'text' | 'email' | 'tel' | 'password';
  readonly autoComplete: string;
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly className?: string;
}

function FormField({
  label,
  type,
  autoComplete,
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: FormFieldProps) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-sp-2', className)}>
      <label htmlFor={id} className="text-muted-sm font-bold text-ink">
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="h-(--height-auth-input) w-full rounded-1 border border-divider bg-surface px-sp-3 text-body-md text-ink placeholder:text-ink-subtle focus:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  );
}

/**
 * FormCta — submit-CTA som responsivt skifter form-faktor:
 *   - Mobil: full-bredde, `lg`-størrelse (52px / text-body-md)
 *   - Desktop: kompakt, `sm`-størrelse, høyre-justert
 *
 * Vi rendrer to `<Button type="submit">`-instanser. Begge er i samme form,
 * så den synlige fanger klikket; den skjulte er deaktivert via `hidden`-
 * klassen og deltar uansett ikke i tab-rekkefølgen siden parent ikke får
 * den i layout. `disabled`-flagget propageres til begge, slik at pending-
 * state holder seg konsistent uavhengig av viewport-bytte.
 */
function FormCta({
  variant,
  pending,
  label,
  pendingLabel,
}: {
  variant: ButtonVariant;
  pending: boolean;
  label: string;
  pendingLabel: string;
}) {
  const text = pending ? pendingLabel : label;
  return (
    <div className="flex pt-sp-1 lg:justify-end lg:pt-0">
      <Button
        type="submit"
        variant={variant}
        size="lg"
        fullWidth
        disabled={pending}
        className="lg:hidden"
      >
        {text}
      </Button>
      <Button
        type="submit"
        variant={variant}
        size="sm"
        disabled={pending}
        className="hidden lg:inline-flex"
      >
        {text}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitDisplayName(displayName: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = displayName.trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] ?? '', lastName: '' };
  const last = parts[parts.length - 1] ?? '';
  const first = parts.slice(0, -1).join(' ');
  return { firstName: first, lastName: last };
}
