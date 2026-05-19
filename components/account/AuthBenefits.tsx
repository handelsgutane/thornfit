/**
 * AuthBenefits — sidebar-kolonne på /konto/logg-inn + /konto/registrer
 * (Paper ALT-1 desktop, AQT-1 mobile).
 *
 * Brand-fixed dark panel — ALLTID mørk (samme prinsipp som footer og drawer-
 * overlay per ADR-0008). Identisk utseende i light og dark mode.
 *
 * Responsive:
 *   - Desktop (≥lg): full høyde av auth-shellet, 520px bredde, full padding
 *     og alle 5 benefits i listen.
 *   - Mobile (<lg): rendres UNDER form-kortet (ikke skjult). Tighter padding
 *     og kun 4 benefits — Paper AQT-1 stopper på 4 for å holde mobil-
 *     viewet kort. Her bruker vi fortsatt dark brand-bakgrunn.
 *
 * Tokens (hardkodet fordi brand-fixed):
 *   - bg: bg-kuro
 *   - text: text-shiro (primary), text-haiiro-light (muted)
 *   - icon-bg: `bg-shiro/10` + stroke aka (red accent matcher CTAen)
 */

import {
  AUTH_BENEFITS,
  AUTH_BENEFITS_KICKER,
  AUTH_BENEFITS_SUBTITLE,
  AUTH_BENEFITS_TITLE,
  type AuthBenefit,
} from '@/lib/auth/info';

// Paper AQT-1 cutter listen ved 4 på mobil. Derfor slice-r vi her, ikke i
// info.ts — alle benefits er gyldige for desktop, mobil ekskluderer bare
// den siste visuelt.
const MOBILE_BENEFITS = AUTH_BENEFITS.slice(0, 4);

export function AuthBenefits() {
  return (
    <aside
      aria-labelledby="auth-benefits-heading"
      className="relative flex flex-col overflow-clip bg-kuro"
    >
      {/* Editorial dekor — ren CSS-gradient fram til vi har et Paper-
          eksportert bilde å droppe i /public/images/. Radial-gradienten gir
          subtil dybde (lys-kuro hotspot øverst til venstre → kuro-deep
          ellers) uten å trenge en 404-ende asset. Når bildet er klart:
          legg den som /public/images/auth-benefits-bg.jpg og bytt denne
          divven mot en <Image fill ... opacity-20 /> med samme scrim. */}
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,var(--color-sumi)_0%,var(--color-kuro)_70%)]"
        aria-hidden
      />

      {/* Mobil-variant — kortere padding, 4 benefits.
          Skjules på desktop (≥lg) hvor desktop-varianten overtar. */}
      <div className="relative flex flex-col gap-sp-5 px-sp-4 py-sp-6 lg:hidden">
        <header className="flex flex-col gap-sp-2">
          <span className="text-label font-bold uppercase text-haiiro-light">
            {AUTH_BENEFITS_KICKER}
          </span>
          <h2
            id="auth-benefits-heading"
            className="text-h3 font-bold text-shiro"
          >
            {AUTH_BENEFITS_TITLE}
          </h2>
          <p className="text-body-sm leading-relaxed text-haiiro-light">
            {AUTH_BENEFITS_SUBTITLE}
          </p>
        </header>

        <ul className="flex flex-col gap-sp-3">
          {MOBILE_BENEFITS.map((benefit) => (
            <BenefitRow key={benefit.id} benefit={benefit} />
          ))}
        </ul>
      </div>

      {/* Desktop-variant — skjult på mobil. h-full sørger for at kolonnen
          stretcher til samme høyde som form-kolonnen i CSS-griden. */}
      <div className="relative hidden h-full flex-col gap-sp-6 px-sp-6 py-sp-7 lg:flex">
        <header className="flex flex-col gap-sp-3">
          <span className="text-label font-bold uppercase text-haiiro-light">
            {AUTH_BENEFITS_KICKER}
          </span>
          <h2 className="text-h2 font-bold text-shiro">
            {AUTH_BENEFITS_TITLE}
          </h2>
          <p className="text-body-sm leading-relaxed text-haiiro-light">
            {AUTH_BENEFITS_SUBTITLE}
          </p>
        </header>

        <ul className="flex flex-col gap-sp-4">
          {AUTH_BENEFITS.map((benefit) => (
            <BenefitRow key={benefit.id} benefit={benefit} />
          ))}
        </ul>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Benefit-row — delt mellom mobil og desktop. Eneste forskjell er hvor mange
// av dem som rendres (mobile-slice) og containerens padding.
// ---------------------------------------------------------------------------

function BenefitRow({ benefit }: { benefit: AuthBenefit }) {
  return (
    <li className="flex items-start gap-sp-3">
      <div
        className="flex size-10 shrink-0 items-center justify-center rounded-1 bg-shiro/10 text-aka"
        aria-hidden
      >
        <BenefitIcon id={benefit.icon} />
      </div>
      <div className="flex flex-col gap-sp-1">
        <span className="text-body-sm font-bold text-shiro">
          {benefit.title}
        </span>
        <span className="text-body-xs text-haiiro-light">
          {benefit.description}
        </span>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Inline icons — matcher Paper-designet 1:1. currentColor = aka.
// ---------------------------------------------------------------------------

function BenefitIcon({ id }: { id: AuthBenefit['icon'] }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 20 20',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;

  if (id === 'package') {
    return (
      <svg {...common}>
        <path d="M3 6l7-3 7 3v8l-7 3-7-3V6z" />
        <path d="M3 6l7 3 7-3M10 9v9" />
      </svg>
    );
  }

  if (id === 'heart') {
    return (
      <svg {...common}>
        <path d="M10 17l-5.5-5a3.5 3.5 0 015-5l.5.5.5-.5a3.5 3.5 0 015 5L10 17z" />
      </svg>
    );
  }

  if (id === 'zap') {
    return (
      <svg {...common}>
        <path d="M11 2L3 11h6l-1 7 8-9h-6l1-7z" />
      </svg>
    );
  }

  if (id === 'percent') {
    return (
      <svg {...common}>
        <path d="M5 15l10-10" />
        <circle cx="6.5" cy="6.5" r="2" />
        <circle cx="13.5" cy="13.5" r="2" />
      </svg>
    );
  }

  // 'sparkles'
  return (
    <svg {...common}>
      <path d="M10 3v4M10 13v4M3 10h4M13 10h4" />
      <path d="M6 6l2 2M12 12l2 2M14 6l-2 2M6 14l2-2" />
    </svg>
  );
}
