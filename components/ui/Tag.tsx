/**
 * Tag — fargekodet status-badge med alltid-på border. Brukes overalt
 * der en domene-status skal kommuniseres visuelt: ordre-status i grid og
 * ordredetalj-header, betalings-status i Betalingsinformasjon.
 *
 * Designreferanse: ordre-grid (Paper 6B7-0) — dette er fasiten.
 *
 * Form-faktor (én størrelse, alltid bordered):
 *   - rounded-1 (2px), padding 3px×8px (py-0.75 px-sp-2)
 *   - text-pill (12px / 15px), font-bold, mixed case ("Levert")
 *   - 1px solid border fra status-token
 *
 * Farger kobles til `--color-status-{variant}-{bg|fg|border}` i globals.css.
 * Disse er brand-fixed og leser like i light og dark mode.
 *
 * Mapping fra domene-status til variant gjøres i feature-laget
 * (`getOrderStatus()` i `lib/account/info.ts`) — Tag er ren visuell
 * primitiv og vet ikke noe om forretningslogikk.
 *
 * Bruk:
 *   const status = getOrderStatus(order.status);
 *   <Tag variant={status.variant}>{status.label}</Tag>
 */

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

export type TagVariant = 'success' | 'warning' | 'neutral' | 'danger';

export interface TagProps {
  readonly children: ReactNode;
  readonly variant?: TagVariant;
  readonly className?: string;
}

const STYLES: Record<TagVariant, string> = {
  success: 'bg-status-success-bg text-status-success-fg border-status-success-border',
  warning: 'bg-status-warning-bg text-status-warning-fg border-status-warning-border',
  neutral: 'bg-status-neutral-bg text-status-neutral-fg border-status-neutral-border',
  danger:  'bg-status-danger-bg text-status-danger-fg border-status-danger-border',
};

export function Tag({ children, variant = 'neutral', className }: TagProps) {
  return (
    <span
      // Leser tokenet via `var(...)` direkte — Tailwind v4 + Turbopack
      // regenererer ikke utility-klasser fra @theme pålitelig i dev.
      // Verdien bor fortsatt i @theme-blokken (token), så vi følger
      // design-system-regelen.
      style={{
        fontSize: 'var(--text-pill)',
        lineHeight: 'var(--text-pill--line-height)',
      }}
      className={cn(
        'inline-flex items-center font-bold',
        'rounded-1 border px-sp-2 py-0.75',
        STYLES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
