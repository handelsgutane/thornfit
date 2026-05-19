/**
 * AccountComingSoon — placeholder-card for konto-subsider som ikke er
 * implementert ennå (Ønskeliste, Personlig informasjon, Adresser, Betaling,
 * Innstillinger).
 *
 * Vises inne i AccountShell på desktop, og full-bleed på mobil.
 */

import {
  COMING_SOON_SUBTITLE,
  COMING_SOON_TITLE,
} from '@/lib/account/info';

interface AccountComingSoonProps {
  readonly title: string;
}

export function AccountComingSoon({ title }: AccountComingSoonProps) {
  return (
    <>
      <header className="flex flex-col gap-sp-1 pb-sp-5 lg:pb-sp-6">
        <h1 className="text-h2 font-bold text-ink">{title}</h1>
      </header>

      <div className="rounded-3 border border-divider bg-surface px-sp-5 py-sp-7 text-center">
        <h2 className="text-h3 font-bold text-ink">{COMING_SOON_TITLE}</h2>
        <p className="mt-sp-2 text-body-sm text-ink-muted">
          {COMING_SOON_SUBTITLE}
        </p>
      </div>
    </>
  );
}
