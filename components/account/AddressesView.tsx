'use client';

/**
 * AddressesView — /konto/adresser
 *
 * Desktop (Paper 6GQ-0 / C72-0):
 *   Liste: "Adresser" h2 + "Legg til adresse"-knapp + adressekort i rad.
 *   Rediger: breadcrumb + "Rediger adresse" + form-card (max-w 640px).
 *
 * Mobil (Paper 7UU-0 / BZ1-0):
 *   Liste: 52px sub-header flush med nav + adressekort stablet.
 *   Rediger: egen sub-header med "Rediger adresse" (text-h4) + skjema.
 *
 * To adressetyper fra Woo: billing (fakturering) og shipping (levering).
 * Konfirmasjon via Toast (Paper BW3-0) ved lagring.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/Button';
import { Toast, useToast } from '@/components/ui/Toast';
import type { WooAddress } from '@/lib/woo/customers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AddressType = 'billing' | 'shipping';
type Mode = 'list' | 'edit';

interface AddressesViewProps {
  readonly billing: WooAddress;
  readonly shipping: WooAddress;
}

// ---------------------------------------------------------------------------
// View root
// ---------------------------------------------------------------------------

export function AddressesView({ billing, shipping }: AddressesViewProps) {
  const [mode, setMode] = useState<Mode>('list');
  const [editingType, setEditingType] = useState<AddressType>('shipping');
  const { toastProps, showToast } = useToast();
  const router = useRouter();

  function startEdit(type: AddressType) {
    setEditingType(type);
    setMode('edit');
  }

  function cancelEdit() {
    setMode('list');
  }

  async function saveAddress(type: AddressType, address: WooAddress) {
    const res = await fetch('/api/auth/addresses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, address }),
      credentials: 'same-origin',
    });

    const body = (await res.json().catch(() => null)) as
      | { ok: boolean; error?: string }
      | null;

    if (!res.ok || !body?.ok) {
      showToast({
        variant: 'error',
        message: body?.error ?? 'Noe gikk galt. Prøv igjen.',
      });
      return;
    }

    showToast({ variant: 'success', message: 'Adresse lagret' });
    setMode('list');
    router.refresh();
  }

  const currentAddress = editingType === 'billing' ? billing : shipping;
  const editTitle =
    editingType === 'billing' ? 'Faktureringsadresse' : 'Leveringsadresse';

  return (
    <>
      {/* ---- Mobil sub-header (liste) ---- */}
      {mode === 'list' && (
        <header className="-mx-sp-3 -mt-sp-5 flex h-13 shrink-0 items-center gap-3 border-b border-divider bg-surface px-sp-3 md:-mx-sp-7 md:px-sp-7 lg:hidden">
          <Link
            href="/konto"
            aria-label="Tilbake til kontooversikt"
            className="flex shrink-0 items-center text-ink-muted hover:text-ink"
          >
            <BackChevron />
          </Link>
          <span className="text-body-md font-bold text-ink">Adresser</span>
        </header>
      )}

      {/* ---- Mobil sub-header (rediger) — Paper C5N-0: py-4 px-5, text-h4 ---- */}
      {mode === 'edit' && (
        <header className="-mx-sp-3 -mt-sp-5 flex shrink-0 items-center gap-3 border-b border-divider bg-surface py-4 px-5 md:-mx-sp-7 md:px-sp-7 lg:hidden">
          <button
            type="button"
            onClick={cancelEdit}
            aria-label="Tilbake til adresser"
            className="flex shrink-0 items-center text-ink-muted hover:text-ink"
          >
            <BackChevron />
          </button>
          <span className="text-h4 font-bold text-ink">Rediger adresse</span>
        </header>
      )}

      {mode === 'list' ? (
        <>
          {/* ---- Desktop header ---- */}
          <div className="hidden items-center justify-between pb-sp-4 lg:flex">
            <h1 className="text-h2 font-bold text-ink">Adresser</h1>
            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<PlusIcon />}
              onClick={() => {}}
              className="cursor-not-allowed opacity-50"
              aria-disabled
            >
              Legg til adresse
            </Button>
          </div>

          {/* ---- Mobil: "Legg til adresse"-knapp (Paper 82A-0: h-44, border, rounded-1) ---- */}
          <div className="lg:hidden">
            <button
              type="button"
              disabled
              className="flex h-11 w-full cursor-not-allowed items-center justify-center gap-sp-2 rounded-1 border border-ink bg-surface text-body-sm font-bold text-ink opacity-50"
            >
              <PlusIcon />
              Legg til adresse
            </button>
          </div>

          {/* ---- Adressekort ---- */}
          <div className="flex flex-col gap-3 lg:flex-row lg:gap-5">
            <AddressCard
              label="Leveringsadresse"
              isDefault
              address={shipping}
              onEdit={() => startEdit('shipping')}
            />
            <AddressCard
              label="Faktureringsadresse"
              address={billing}
              onEdit={() => startEdit('billing')}
            />
          </div>
        </>
      ) : (
        /* ---- Rediger-form ---- */
        <>
          {/* Desktop breadcrumb + title */}
          <div className="hidden flex-col gap-sp-2 pb-sp-4 lg:flex">
            <button
              type="button"
              onClick={cancelEdit}
              className="inline-flex w-fit items-center gap-sp-1 text-body-xs text-ink-muted hover:text-ink"
            >
              ← Adresser
            </button>
            <h1 className="text-h2 font-bold text-ink">Rediger adresse</h1>
            <p className="text-body-sm text-ink-muted">{editTitle}</p>
          </div>

          <AddressForm
            key={editingType}
            type={editingType}
            initial={currentAddress}
            onSave={saveAddress}
            onCancel={cancelEdit}
          />
        </>
      )}

      {toastProps && <Toast {...toastProps} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Address card (Paper 6Y5-0 desktop / 82F-0 mobile)
// ---------------------------------------------------------------------------

function AddressCard({
  label,
  isDefault = false,
  address,
  onEdit,
}: {
  label: string;
  isDefault?: boolean;
  address: WooAddress;
  onEdit: () => void;
}) {
  const isEmpty =
    !address.addressLine1 && !address.firstName && !address.city;

  return (
    /* p-sp-3 mobil / p-sp-4 desktop — Paper 82F-0 / 6Y5-0 */
    <section className="flex flex-1 flex-col gap-sp-4 rounded-1 border border-divider bg-surface p-sp-3 lg:p-sp-4">
      {/* Header: label + Standard-badge + actions */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          {/* Label: 10px UPPERCASE bold ink-muted (Paper 82I-0 / 6Y8-0) */}
          <span className="text-label-sm font-bold uppercase text-ink-muted lg:text-label">
            {label}
          </span>
          {isDefault && (
            /* Standard-badge: rounded-1, py-[2px] px-sp-2, bg-surface-contrast */
            <span className="mt-1 w-fit rounded-1 py-[2px] px-sp-2 bg-surface-contrast">
              <span className="text-label-sm font-bold uppercase text-white">
                Standard
              </span>
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onEdit}
            className="text-body-xs font-medium text-ink hover:underline"
          >
            Rediger
          </button>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-canvas" />

      {/* Address lines */}
      {isEmpty ? (
        <p className="text-body-sm text-ink-muted">Ingen adresse registrert</p>
      ) : (
        <address className="flex flex-col gap-0.5 not-italic">
          {(address.firstName || address.lastName) && (
            <p className="text-body-sm font-bold text-ink">
              {[address.firstName, address.lastName].filter(Boolean).join(' ')}
            </p>
          )}
          {address.company && (
            <p className="text-body-sm text-ink">{address.company}</p>
          )}
          {address.addressLine1 && (
            <p className="text-body-sm text-ink">{address.addressLine1}</p>
          )}
          {address.addressLine2 && (
            <p className="text-body-sm text-ink">{address.addressLine2}</p>
          )}
          {(address.postcode || address.city) && (
            <p className="text-body-sm text-ink">
              {[address.postcode, address.city].filter(Boolean).join(' ')}
            </p>
          )}
          {address.country && (
            <p className="text-body-sm text-ink">
              {formatCountry(address.country)}
            </p>
          )}
          {address.phone && (
            <p className="text-body-sm text-ink">{address.phone}</p>
          )}
          {address.email && (
            <p className="text-body-sm text-ink">{address.email}</p>
          )}
        </address>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Address edit form (Paper CAC-0 desktop / BZ1-0 mobile)
// ---------------------------------------------------------------------------

function AddressForm({
  type,
  initial,
  onSave,
  onCancel,
}: {
  type: AddressType;
  initial: WooAddress;
  onSave: (type: AddressType, address: WooAddress) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<WooAddress>({ ...initial });
  const [pending, setPending] = useState(false);
  const [isDefault, setIsDefault] = useState(type === 'shipping');

  function set(field: keyof WooAddress, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      await onSave(type, values);
    } finally {
      setPending(false);
    }
  }

  return (
    /* Paper CAC-0: max-w-640px, border, rounded-1, p-32, gap-20 */
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-sp-4 rounded-1 border border-divider bg-surface p-sp-3 lg:max-w-xl lg:p-8"
    >
      <Field label="Adressenavn" htmlFor="addr-name">
        <Input
          id="addr-name"
          placeholder="F.eks. Hjemme, Jobb…"
          value={values.company}
          onChange={(v) => set('company', v)}
          disabled={pending}
        />
      </Field>

      {/* Fornavn / Etternavn — 2-kol (Paper CAH-0: gap-16) */}
      <div className="flex gap-sp-3 lg:gap-sp-4">
        <Field label="Fornavn" htmlFor="addr-first" className="flex-1">
          <Input
            id="addr-first"
            autoComplete="given-name"
            value={values.firstName}
            onChange={(v) => set('firstName', v)}
            disabled={pending}
          />
        </Field>
        <Field label="Etternavn" htmlFor="addr-last" className="flex-1">
          <Input
            id="addr-last"
            autoComplete="family-name"
            value={values.lastName}
            onChange={(v) => set('lastName', v)}
            disabled={pending}
          />
        </Field>
      </div>

      <Field label="Gateadresse" htmlFor="addr-line1">
        <Input
          id="addr-line1"
          autoComplete="address-line1"
          value={values.addressLine1}
          onChange={(v) => set('addressLine1', v)}
          disabled={pending}
          required
        />
      </Field>

      {/* Postnummer / By — 2-kol (Paper CAU-0: 140px/418px) */}
      <div className="flex gap-sp-3 lg:gap-sp-4">
        <Field label="Postnr." htmlFor="addr-post" className="w-28 shrink-0 lg:w-36">
          <Input
            id="addr-post"
            autoComplete="postal-code"
            value={values.postcode}
            onChange={(v) => set('postcode', v)}
            disabled={pending}
            required
          />
        </Field>
        <Field label="By" htmlFor="addr-city" className="flex-1">
          <Input
            id="addr-city"
            autoComplete="address-level2"
            value={values.city}
            onChange={(v) => set('city', v)}
            disabled={pending}
            required
          />
        </Field>
      </div>

      {/* Land — Norway-only (ADR-0005) */}
      <Field label="Land" htmlFor="addr-country">
        <div className="relative">
          <select
            id="addr-country"
            value={values.country}
            onChange={(e) => set('country', e.target.value)}
            disabled={pending}
            className="h-(--height-auth-input) w-full appearance-none rounded-1 border border-divider bg-surface px-sp-3 text-body-md text-ink focus:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2"
          >
            <option value="NO">Norge</option>
          </select>
          <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
        </div>
      </Field>

      <Field label="Telefonnummer" htmlFor="addr-phone">
        <Input
          id="addr-phone"
          type="tel"
          autoComplete="tel"
          value={values.phone}
          onChange={(v) => set('phone', v)}
          disabled={pending}
        />
      </Field>

      {type === 'billing' && (
        <Field label="E-post" htmlFor="addr-email">
          <Input
            id="addr-email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(v) => set('email', v)}
            disabled={pending}
          />
        </Field>
      )}

      {/* "Sett som standard leveringsadresse" checkbox (Paper CBD-0) */}
      {type === 'shipping' && (
        <label className="flex cursor-pointer items-center gap-2.5 pt-1">
          <span
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-1 border transition-colors ${
              isDefault
                ? 'border-surface-contrast bg-surface-contrast'
                : 'border-divider bg-surface'
            }`}
            onClick={() => setIsDefault((v) => !v)}
            role="checkbox"
            aria-checked={isDefault}
            tabIndex={0}
            onKeyDown={(e) => e.key === ' ' && setIsDefault((v) => !v)}
          >
            {isDefault && <CheckboxCheck />}
          </span>
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="sr-only"
            tabIndex={-1}
          />
          <span className="text-body-xs text-ink">
            Sett som standard leveringsadresse
          </span>
        </label>
      )}

      {/* Divider */}
      <div className="h-px bg-divider" />

      {/* Buttons (Paper CBJ-0: gap-12) */}
      <div className="flex flex-col gap-sp-3 lg:flex-row lg:gap-3">
        {/* Mobile: full-width lg buttons */}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          disabled={pending}
          className="lg:hidden"
        >
          {pending ? 'Lagrer…' : 'Lagre adresse'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          fullWidth
          disabled={pending}
          onClick={onCancel}
          className="lg:hidden"
        >
          Avbryt
        </Button>
        {/* Desktop: sm kompakt */}
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={pending}
          className="hidden lg:inline-flex"
        >
          {pending ? 'Lagrer…' : 'Lagre adresse'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={onCancel}
          className="hidden lg:inline-flex"
        >
          Avbryt
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Form primitives
// ---------------------------------------------------------------------------

function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-[6px] ${className ?? ''}`}>
      {/* Paper CAE-0: 14px label (matches FormField in PersonligInformasjonView) */}
      <label htmlFor={htmlFor} className="text-muted-sm font-bold text-ink">
        {label}
      </label>
      {children}
    </div>
  );
}

function Input({
  id,
  type = 'text',
  autoComplete,
  placeholder,
  value,
  onChange,
  disabled,
  required,
}: {
  id: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <input
      id={id}
      type={type}
      autoComplete={autoComplete}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      required={required}
      /* Paper CAF-0: rounded-1, paddingBlock 11px, paddingInline 14px, border divider */
      className="h-(--height-auth-input) w-full rounded-1 border border-divider bg-surface px-sp-3 text-body-md text-ink placeholder:text-ink-subtle focus:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
    />
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCountry(code: string): string {
  const map: Record<string, string> = { NO: 'Norge', SE: 'Sverige', DK: 'Danmark' };
  return map[code] ?? code;
}

// ---------------------------------------------------------------------------
// Ikoner
// ---------------------------------------------------------------------------

function BackChevron() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <line x1="6" y1="1" x2="6" y2="11" />
      <line x1="1" y1="6" x2="11" y2="6" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <polyline points="3,5 7,9 11,5" />
    </svg>
  );
}

function CheckboxCheck() {
  return (
    <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden>
      <polyline points="1,4 4,7 9,1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
