'use client';

/**
 * SettingsView — /konto/innstillinger
 *
 * Desktop (Paper 6GS-0): "Innstillinger" h2 + 3 seksjonskort i kolonne.
 * Mobil (Paper 7UW-0): 52px sub-header flush + kort på canvas-bakgrunn.
 *
 * Ikke wires opp mot backend — toggle-state er lokal, action-knapper er
 * placeholders. Kobles til API i en fremtidig milestone.
 *
 * Tre seksjoner:
 *   1. E-postvarsler — Ordrebekreftelse, Fraktvarsler, Kampanjer, Nyhetsbrev
 *   2. Push-varsler — Statusoppdateringer for ordre, Tilbudsalarmer
 *   3. Konto — Last ned dine data, Slett konto (destruktiv)
 */

import Link from 'next/link';
import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToggleSetting {
  id: string;
  title: string;
  description: string;
  defaultOn?: boolean;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const EMAIL_SETTINGS: ToggleSetting[] = [
  {
    id: 'order-confirm',
    title: 'Ordrebekreftelse',
    description: 'Motta bekreftelse når en ordre er plassert',
    defaultOn: true,
  },
  {
    id: 'shipping-updates',
    title: 'Fraktvarsler',
    description: 'Oppdateringer om pakken din og leveringsstatus',
    defaultOn: true,
  },
  {
    id: 'campaigns',
    title: 'Kampanjer og tilbud',
    description: 'Eksklusive rabatter, sesongtilbud og nye produkter',
    defaultOn: false,
  },
  {
    id: 'newsletter',
    title: 'Nyhetsbrev',
    description: 'Innhold om knivstell, matlagingstips og inspirasjon',
    defaultOn: false,
  },
];

const PUSH_SETTINGS: ToggleSetting[] = [
  {
    id: 'push-order',
    title: 'Statusoppdateringer for ordre',
    description: 'Varsler i nettleseren din når en ordre endrer status',
    defaultOn: true,
  },
  {
    id: 'push-deals',
    title: 'Tilbudsalarmer',
    description: 'Bli varslet om tidsbegrensede tilbud og utsolgt-varsler',
    defaultOn: false,
  },
];

// ---------------------------------------------------------------------------
// View root
// ---------------------------------------------------------------------------

export function SettingsView() {
  const [emailToggles, setEmailToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(EMAIL_SETTINGS.map((s) => [s.id, s.defaultOn ?? false])),
  );
  const [pushToggles, setPushToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(PUSH_SETTINGS.map((s) => [s.id, s.defaultOn ?? false])),
  );

  return (
    <>
      {/* ---- Mobil sub-header (Paper 85Q-0) ---- */}
      <header className="-mx-sp-3 -mt-sp-5 flex h-13 shrink-0 items-center gap-3 border-b border-divider bg-surface px-sp-3 md:-mx-sp-7 md:px-sp-7 lg:hidden">
        <Link
          href="/konto"
          aria-label="Tilbake til kontooversikt"
          className="flex shrink-0 items-center text-ink-muted hover:text-ink"
        >
          <BackChevron />
        </Link>
        {/* Paper 85T-0: 15px bold -0.01em */}
        <span className="text-body-md font-bold text-ink">Innstillinger</span>
      </header>

      {/* ---- Desktop header ---- */}
      <header className="hidden pb-sp-4 lg:block">
        <h1 className="text-h2 font-bold text-ink">Innstillinger</h1>
      </header>

      {/* ---- Innhold — canvas-bg på mobil, ingen bg på desktop ---- */}
      <div className="-mx-sp-3 flex flex-col gap-3 bg-canvas p-sp-3 md:-mx-sp-7 md:p-sp-7 lg:mx-0 lg:gap-8 lg:bg-transparent lg:p-0">

        {/* ---- E-postvarsler ---- */}
        <SettingsCard
          title="E-postvarsler"
          items={EMAIL_SETTINGS.map((s) => ({
            ...s,
            on: emailToggles[s.id] ?? false,
            onToggle: () =>
              setEmailToggles((prev) => ({ ...prev, [s.id]: !prev[s.id] })),
          }))}
        />

        {/* ---- Push-varsler ---- */}
        <SettingsCard
          title="Push-varsler"
          items={PUSH_SETTINGS.map((s) => ({
            ...s,
            on: pushToggles[s.id] ?? false,
            onToggle: () =>
              setPushToggles((prev) => ({ ...prev, [s.id]: !prev[s.id] })),
          }))}
        />

        {/* ---- Konto ---- */}
        <KontoCard />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Settings card with toggles (Paper 73L-0 / 85V-0)
// ---------------------------------------------------------------------------

function SettingsCard({
  title,
  items,
}: {
  title: string;
  items: Array<ToggleSetting & { on: boolean; onToggle: () => void }>;
}) {
  return (
    <section className="overflow-hidden rounded-1 border border-divider bg-surface">
      {/* Section header — Paper 73M-0 (desktop) / 85W-0 (mobile) */}
      <header className="border-b border-divider px-sp-3 py-3.5 lg:px-sp-4 lg:py-5">
        {/* Desktop: 16px bold (73N-0). Mobile: 13px bold (85X-0) */}
        <h2 className="text-body-xs font-bold text-ink lg:text-body font-bold text-ink">
          {title}
        </h2>
      </header>

      <ul>
        {items.map((item, idx) => (
          <li
            key={item.id}
            className={
              idx < items.length - 1
                ? 'border-b border-canvas'
                : undefined
            }
          >
            {/* Toggle row — Paper 73O-0 / 85Y-0 */}
            <label className="flex cursor-pointer items-center justify-between gap-sp-3 px-sp-3 py-3.5 lg:px-sp-4 lg:py-sp-3">
              {/* Left: title + description */}
              <div className="flex flex-col gap-0.5">
                {/* 14px bold (73Q-0 / 860-0) */}
                <span className="text-body-sm font-bold text-ink">{item.title}</span>
                {/* Desktop: 13px regular (73R-0). Mobile: 12px regular (861-0) */}
                <span className="text-muted-sm text-ink-muted lg:text-body-xs">
                  {item.description}
                </span>
              </div>
              {/* Toggle */}
              <Toggle on={item.on} onToggle={item.onToggle} />
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Konto card (Paper 74R-0 / 871-0) — action rows, not toggles
// ---------------------------------------------------------------------------

function KontoCard() {
  return (
    <section className="overflow-hidden rounded-1 border border-divider bg-surface">
      {/* Section header */}
      <header className="border-b border-divider px-sp-3 py-3.5 lg:px-sp-4 lg:py-5">
        <h2 className="text-body-xs font-bold text-ink lg:text-body font-bold text-ink">
          Konto
        </h2>
      </header>

      {/* Last ned dine data (Paper 74U-0 / 874-0) */}
      <div className="flex items-center justify-between gap-sp-3 border-b border-canvas px-sp-3 py-3.5 lg:px-sp-4 lg:py-5">
        <div className="flex flex-col gap-0.5">
          <span className="text-body-sm font-bold text-ink">Last ned dine data</span>
          <span className="text-muted-sm text-ink-muted lg:text-body-xs">
            Eksporter alle dine personopplysninger og ordrehistorikk
          </span>
        </div>
        {/* Desktop: border 1.5px (74Y-0). Mobile: border 1px rounded-1 (878-0) */}
        <button
          type="button"
          disabled
          className="shrink-0 cursor-not-allowed rounded-1 border border-ink px-3.5 py-[7px] text-muted-sm font-bold text-ink opacity-50 lg:border-[1.5px] lg:px-5 lg:py-2 lg:text-body-xs"
        >
          Last ned
        </button>
      </div>

      {/* Slett konto — destruktiv rad (Paper 750-0 / 87A-0) */}
      {/* Desktop: bg #FFF8F8 (lett rød) */}
      <div className="flex items-center justify-between gap-sp-3 px-sp-3 py-3.5 lg:bg-status-danger-bg lg:px-sp-4 lg:py-5">
        <div className="flex flex-col gap-0.5">
          {/* Danger-red title on desktop (752-0: #CC2929 = status-danger-fg) */}
          <span className="text-body-sm font-bold text-ink lg:text-status-danger-fg">
            Slett konto
          </span>
          <span className="text-muted-sm text-ink-muted lg:text-body-xs">
            Permanent sletting av konto og alle tilknyttede data. Kan ikke angres.
          </span>
        </div>
        {/* Border danger-red (754-0 / 87E-0) */}
        <button
          type="button"
          disabled
          className="shrink-0 cursor-not-allowed rounded-1 border border-status-danger-fg px-3.5 py-[7px] text-muted-sm font-bold text-status-danger-fg opacity-50 lg:border-[1.5px] lg:px-5 lg:py-2 lg:text-body-xs"
        >
          Slett konto
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Toggle (Paper 73S-0/73T-0 / 862-0/863-0)
// 40×22px pill, 16×16 white thumb. On: thumb right + bg-surface-contrast.
// Off: thumb left + bg-divider.
// ---------------------------------------------------------------------------

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={(e) => {
        e.preventDefault();
        onToggle();
      }}
      className={`relative inline-flex h-[22px] w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2 ${
        on ? 'bg-surface-contrast' : 'bg-divider'
      }`}
    >
      <span
        className={`absolute size-4 rounded-full bg-white shadow-sm transition-transform ${
          on ? 'right-[3px]' : 'left-[3px]'
        }`}
      />
    </button>
  );
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
