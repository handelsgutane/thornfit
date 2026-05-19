/**
 * ContactPage — /kontakt-oss (Paper 9WU-1).
 *
 * Tre seksjoner stacket:
 *   1. **Hero (dark kuro-band)** — full-bleed. Kicker "HJELP OG KONTAKT",
 *      H1, kort subtittel. Samme pattern som legal-hero men mørk bakgrunn.
 *   2. **Kontakt-kort (3-kolonne desktop, stacked mobil)** — én per kanal
 *      (chat/e-post/besøk). Hver har icon-wrapper (44×44) + tittel +
 *      beskrivelse + CTA med pil-arrow. Chat har aka-icon; e-post og besøk
 *      har kuro-icon.
 *   3. **Butikk-seksjon (2-kolonne desktop, stacked mobil)** — venstre:
 *      kicker/h2/body + åpningstider-tabell + services-chips. Høyre: map-
 *      placeholder (grå firkant med rød pin) + info-overlay-kort nederst
 *      venstre.
 *
 * **Brand-tokens vs semantic:** hero-banderet er alltid-mørkt by design
 * (brand-fixed `bg-kuro`, `text-shiro`, `text-haiiro`). Alle andre flater
 * bruker semantic tokens (`surface`, `ink`, `divider`) som flipper med
 * light/dark (ADR-0008).
 *
 * **Mobile map fallback:** på mobil scroller man forbi kortet; vi viser
 * samme placeholder i full bredde med info-overlay synlig. Senere kan dette
 * byttes til et ekte `iframe`-kart når vi har nøkkel / valg av provider.
 *
 * **RSC:** ingen state, ingen hendelser som trenger hydrering. Hele siden
 * kan serveres som pre-rendret HTML. Chat-CTA er en placeholder-lenke til
 * `#start-chat` inntil Intercom/Crisp er wired opp.
 */

import Link from 'next/link';

import {
  CONTACT_CHANNELS,
  CONTACT_HERO_KICKER,
  CONTACT_HERO_SUBTITLE,
  CONTACT_HERO_TITLE,
  CONTACT_OPENING_HOURS,
  CONTACT_STORE,
  CONTACT_STORE_SERVICES,
  type ContactChannel,
} from '@/lib/contact/info';

export function ContactPage() {
  return (
    <>
      <ContactHero />
      <ContactChannelsSection />
      <StoreSection />
    </>
  );
}

// ---------------------------------------------------------------------------
// 1. Hero — dark kuro-band. Full-bleed; horizontal padding matcher resten av
//    appen (`px-sp-3` mobil / `px-sp-7` desktop).
// ---------------------------------------------------------------------------

function ContactHero() {
  return (
    <header className="bg-kuro px-sp-3 pt-sp-6 pb-sp-7 md:px-sp-7 md:pt-sp-7 md:pb-sp-7">
      <div className="flex flex-col gap-sp-3">
        <span className="text-label font-bold uppercase text-haiiro">
          {CONTACT_HERO_KICKER}
        </span>
        <h1 className="text-h2 font-bold text-shiro md:text-h1">
          {CONTACT_HERO_TITLE}
        </h1>
        <p className="max-w-(--width-hero-text) text-body-sm leading-relaxed text-haiiro md:text-body">
          {CONTACT_HERO_SUBTITLE}
        </p>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// 2. Contact channels — tre kort i rad på desktop, stacket på mobil.
// ---------------------------------------------------------------------------

function ContactChannelsSection() {
  return (
    <section
      aria-labelledby="contact-channels-heading"
      className="bg-canvas px-sp-3 pt-sp-6 md:px-sp-7 md:pt-sp-7"
    >
      {/* Visuelt er dette kort-rad + bold titler — men vi trenger en h2 for
          skjermlesere så landmarket gir mening. Skjult visuelt med sr-only. */}
      <h2 id="contact-channels-heading" className="sr-only">
        Slik kan du kontakte oss
      </h2>
      <div className="grid gap-sp-4 md:grid-cols-3">
        {CONTACT_CHANNELS.map((channel) => (
          <ContactChannelCard key={channel.id} channel={channel} />
        ))}
      </div>
    </section>
  );
}

function ContactChannelCard({ channel }: { channel: ContactChannel }) {
  // Eksterne lenker (mailto, https://maps.google) skal IKKE wrappes i
  // Next.js `<Link>` — bruk ren `<a>` for de. Interne hash- og path-lenker
  // bruker `<Link>` for client-nav.
  const isExternal =
    channel.href.startsWith('mailto:') ||
    channel.href.startsWith('tel:') ||
    channel.href.startsWith('http');

  // Icon-wrapper må ha både `bg-*` og en tekstfarge (SVG-stroken arver via
  // `currentColor`). I dark mode flipper `bg-ink` til lys bakgrunn — uten å
  // også flippe stroken endte e-post/besøk-kortene opp som hvitt-på-hvitt.
  //  - aka (chat): aka er brand-fixed rød i begge moduser → alltid hvit icon.
  //  - ink (e-post/besøk): bg-ink flipper → bruk ink-inverse som alltid ligger
  //    på kontrast-siden av ink.
  const iconWrapperClass =
    channel.iconTone === 'aka'
      ? 'bg-aka text-shiro'
      : 'bg-ink text-ink-inverse';

  const content = (
    <article className="group flex h-full flex-col gap-sp-4 rounded-1 border border-divider bg-surface px-sp-5 py-sp-5 transition-colors hover:border-ink">
      <div
        className={[
          'flex size-(--size-contact-icon) items-center justify-center rounded-1',
          iconWrapperClass,
        ].join(' ')}
        aria-hidden
      >
        <ChannelIcon id={channel.id} />
      </div>
      <div className="flex flex-col gap-sp-2">
        <h3 className="text-h3 font-bold text-ink">{channel.title}</h3>
        <p className="text-body-sm leading-relaxed text-ink-muted">
          {channel.description}
        </p>
      </div>
      <div className="mt-auto flex items-center gap-sp-1 text-body-sm font-bold text-ink">
        <span className="truncate">{channel.ctaLabel}</span>
        <ArrowRightIcon />
      </div>
    </article>
  );

  if (isExternal) {
    return (
      <a
        href={channel.href}
        // `noreferrer` fordi map-URLen er extern — mailto trenger det ikke,
        // men skader ikke å sette det konsistent.
        rel="noreferrer"
        target={channel.href.startsWith('http') ? '_blank' : undefined}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2"
        aria-label={`${channel.title}: ${channel.ctaLabel}`}
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      href={channel.href}
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2"
      aria-label={`${channel.title}: ${channel.ctaLabel}`}
    >
      {content}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// 3. Store section — venstre info + høyre map.
// ---------------------------------------------------------------------------

function StoreSection() {
  return (
    <section
      aria-labelledby="store-heading"
      className="bg-canvas px-sp-3 pt-sp-6 pb-sp-7 md:px-sp-7 md:py-sp-7"
    >
      <div className="grid gap-sp-5 md:grid-cols-[var(--width-contact-info)_1fr]">
        <StoreInfo />
        <StoreMap />
      </div>
    </section>
  );
}

function StoreInfo() {
  return (
    <div className="flex flex-col gap-sp-5">
      {/* Kicker + H2 + body. */}
      <div className="flex flex-col gap-sp-3">
        <span className="text-label font-bold uppercase text-ink-muted">
          Butikk i Mathallen
        </span>
        <h2 id="store-heading" className="text-h2 font-bold text-ink">
          Vulkan 24, Oslo
        </h2>
        <p className="max-w-(--width-hero-text) text-body-sm leading-relaxed text-ink-muted md:text-body">
          {CONTACT_STORE.description}
        </p>
      </div>

      <OpeningHoursTable />

      <ServicesChipList />
    </div>
  );
}

function OpeningHoursTable() {
  return (
    <div className="overflow-clip rounded-1 border border-divider bg-surface">
      <div className="border-b border-divider px-sp-4 py-sp-3">
        <span className="text-label font-bold uppercase text-ink-muted">
          Åpningstider
        </span>
      </div>
      {CONTACT_OPENING_HOURS.map((row, i) => {
        const isLast = i === CONTACT_OPENING_HOURS.length - 1;
        return (
          <div
            key={row.label}
            className={[
              'flex items-center justify-between px-sp-4 py-sp-3',
              // Subtle row-divider (sakai muted) mellom rader, ingen på siste.
              isLast ? '' : 'border-b border-divider',
            ].join(' ')}
          >
            <span className="text-body-sm text-ink">{row.label}</span>
            <span
              className={[
                'text-body-sm tabular-nums',
                row.closed ? 'text-ink-muted' : 'font-bold text-ink',
              ].join(' ')}
            >
              {row.hours}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ServicesChipList() {
  return (
    <ul
      aria-label="Tjenester i butikken"
      className="flex flex-wrap gap-sp-2"
    >
      {CONTACT_STORE_SERVICES.map((service) => (
        <li
          key={service}
          className="rounded-1 border border-divider bg-surface px-sp-3 py-sp-2 text-body-xs font-medium text-ink"
        >
          {service}
        </li>
      ))}
    </ul>
  );
}

function StoreMap() {
  // Google Maps embed via `output=embed` — krever ingen API-nøkkel og har
  // sin egen røde pin, så vi dropper den roterte Paper-pin-en her (den var en
  // placeholder-marker for et tomt kart-område). Iframen håndterer selv pan/
  // zoom og "Åpne i Maps"-CTAen i hjørnet.
  //
  // **Ingen dark-mode-flip:** Google-iframen er alltid lys. Hvis vi senere vil
  // at kartet skal flippe med tema, bytt til MapLibre GL + custom style.
  //
  // **Info-overlay er nå en ekte lenke** — klikkes den åpner den en full-
  // skjerm Maps-visning (mer nyttig enn bare dekorativ tekst). Overlayen
  // ligger oppå iframen og bruker shadow-sm så den leser som "løftet kort".
  return (
    <div className="relative min-h-(--height-contact-map) overflow-clip rounded-1 border border-divider bg-surface-muted">
      <iframe
        src={`https://www.google.com/maps?q=${encodeURIComponent(
          CONTACT_STORE.addressLine,
        )}&output=embed`}
        title={`Kart over ${CONTACT_STORE.brand}, ${CONTACT_STORE.addressLine}`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="absolute inset-0 size-full border-0"
      />

      <a
        href={CONTACT_STORE.mapUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`Åpne ${CONTACT_STORE.addressLine} i Google Maps (ny fane)`}
        className="absolute bottom-sp-4 left-sp-4 flex flex-col gap-sp-1 rounded-1 bg-surface px-sp-3 py-sp-3 shadow-sm transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2"
      >
        <span className="text-body-xs font-bold text-ink">
          {CONTACT_STORE.brand}
        </span>
        <span className="text-muted-sm text-ink-muted">
          {CONTACT_STORE.addressLine}
        </span>
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SVG-ikoner — inline (ingen runtime-avhengighet). Matcher Paper 1:1.
// ---------------------------------------------------------------------------

function ChannelIcon({ id }: { id: ContactChannel['id'] }) {
  // `stroke="currentColor"` — arver farge fra wrapperen (`text-shiro` for
  // aka-kanalen, `text-ink-inverse` for ink-kanalene), slik at stroken
  // flipper med temaet sammen med bakgrunnen.
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 22 22',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    stroke: 'currentColor',
    strokeWidth: 1.5,
  } as const;

  if (id === 'chat') {
    return (
      <svg {...common} strokeLinejoin="round">
        <path d="M4 4h14a1 1 0 011 1v9a1 1 0 01-1 1H7l-4 4V5a1 1 0 011-1z" />
      </svg>
    );
  }

  if (id === 'email') {
    return (
      <svg {...common}>
        <rect x="2" y="5" width="18" height="13" rx="1" />
        <path d="M2 7l9 6 9-6" strokeLinecap="round" />
      </svg>
    );
  }

  // 'visit'
  return (
    <svg {...common} strokeLinejoin="round">
      <path d="M11 2C8.24 2 6 4.24 6 7c0 4 5 11 5 11s5-7 5-11c0-2.76-2.24-5-5-5z" />
      <circle cx="11" cy="7" r="2" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 transition-transform group-hover:translate-x-0.5"
    >
      <path
        d="M2 7h10M8 3l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
