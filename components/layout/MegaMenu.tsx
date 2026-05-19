/**
 * MegaMenu — V2 (Paper E16-1 "Nav — Mega Menu (Kniver) · V2").
 *
 * 5-kolonne layout, alle verdier hentet med get_computed_styles + get_jsx:
 *
 *  ┌─ OPPDAG (220px) ─┬─ KNIVTYPER (220px) ─┬─ SMEDER (220px) ─┬─ MERKER (220px) ─┬─ EDITORIAL (flex-1) ─┐
 *  │ icon+link liste  │ icon+link liste      │ plain text liste  │ 14px text liste   │ dark image card       │
 *  │ første uthevet   │ Se alle →            │ Se alle →         │ Se alle →         │ + service shortcuts   │
 *  └──────────────────┴──────────────────────┴───────────────────┴──────────────────┴───────────────────────┘
 *
 * Kolonne-spec (px fra Paper):
 *   col-oppdag:   220px, shrink-0, pt-36 pr-32 pb-40, border-r #F0F0EC
 *   col-knivtyper: 220px, shrink-0, pt-36 pr-32 pb-40 pl-32, border-r #F0F0EC
 *   col-smeder:   220px, shrink-0, pt-36 pr-32 pb-40 pl-32, border-r #F0F0EC
 *   col-merker:   220px, shrink-0, p-32, border-r #E0E0DC
 *   col-editorial: flex-1, pt-32 pb-32 pl-32, gap-16
 *
 * Kolonne-label typo:
 *   oppdag/knivtyper/smeder: 10px / 700 / 0.12em / uppercase / ink-muted
 *   merker: 11px / 700 / 0.1em / uppercase / ink-muted
 *
 * Link-rad (kun tekst — ingen ikoner):
 *   h-34 hover: bg-canvas rounded-1, hover-bg ekstenderer til kolonne-kant
 *   via negativ margin (-mr-8 / -mx-8). Tekst flush venstre med kolonne-label.
 *   Første rad i OPPDAG: bg-canvas rounded-1 mb-4 (alltid uthevet, bold).
 *   Tekst: 13px regular ink (700 kun første rad i OPPDAG).
 *
 * "Se alle"-lenke: 12px / 700 / aka, mt-12 py-7 px-10
 *
 * Panel: bg-surface, border-top+bottom divider,
 *        shadow: 0px 8px 24px rgba(0,0,0,0.07), px-64
 *
 * Data-mapping:
 *   overview  → OPPDAG (lead = første uthevet, links = resten)
 *   groups[0] → KNIVTYPER
 *   groups[1] → SMEDER
 *   groups[2] → MERKER (vises kun hvis finnes)
 *   editorial → EDITORIAL
 */

import Link from 'next/link';
import type { MouseEventHandler, Ref } from 'react';

import type {
  NavEditorial,
  NavLinkGroup,
  NavMega,
  NavOverviewColumn,
} from '@/lib/nav/schema';
import { cn } from '@/lib/utils/cn';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type MegaMenuProps = {
  mega: NavMega;
  open: boolean;
  id: string;
  rootRef?: Ref<HTMLDivElement>;
  onMouseEnter?: MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: MouseEventHandler<HTMLDivElement>;
  onNavigate?: () => void;
};

// ---------------------------------------------------------------------------
// Column header (shared)
// ---------------------------------------------------------------------------

/** 10px / 700 / 0.12em tracking — oppdag/knivtyper/smeder */
function ColLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="mb-sp-3 block font-bold uppercase text-ink"
      style={{
        fontSize: 'var(--text-label-sm)',
        lineHeight: 'var(--text-label-sm--line-height)',
        letterSpacing: '0.12em',
      }}
    >
      {children}
    </span>
  );
}

/** 11px / 700 / 0.1em tracking — merker. Hvis `href` er satt rendres
 *  headeren som en `<Link>` med hover-aksent (text-aka), ellers som plain
 *  span. Brukes i alle kolonnene i mega-menyen. */
function ColLabelMerker({
  children,
  href,
  onNavigate,
}: {
  children: React.ReactNode;
  href?: string;
  onNavigate?: () => void;
}) {
  if (!href) {
    return (
      <span className="mb-sp-3 block text-label font-bold uppercase text-ink">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="mb-sp-3 block text-label font-bold uppercase text-ink transition-colors hover:text-aka"
    >
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// "Se alle"-lenke (12px bold aka, hover underline) — speiler MerkerCol-mønsteret
// så alle kolonner i mega-menyen har samme bunn-link-styling.
// ---------------------------------------------------------------------------

function SeeAllLink({ href, label, onNavigate }: { href: string; label: string; onNavigate?: () => void }) {
  return (
    <div className="mt-3 flex h-[30px] items-center">
      <Link
        href={href}
        onClick={onNavigate}
        className="text-body-xs font-bold text-aka hover:underline"
      >
        {label}
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OPPDAG-kolonne (overview) — første rad uthevet, icon+text
// ---------------------------------------------------------------------------

function Oppdag({ overview, onNavigate }: { overview: NavOverviewColumn; onNavigate?: () => void }) {
  return (
    <div className="w-60 shrink-0 border-r border-canvas pb-10 pr-8 pt-9">
      <ColLabelMerker href={overview.lead.href} onNavigate={onNavigate}>
        {overview.title}
      </ColLabelMerker>

      <div className="flex flex-col">
        {/* Første rad — alltid uthevet (bg-canvas, bold tekst).
            Hover/aktiv-bg går helt til høyre kant av kolonnen via -mr-8.
            Ingen ikon — tekst flush venstre med kolonne-label. */}
        <Link
          href={overview.lead.href}
          onClick={onNavigate}
          className="-mr-8 mb-1 flex h-[34px] items-center rounded-1 bg-canvas pl-0 pr-[42px] transition-colors hover:bg-surface-muted" /* paper-exact: brukerjustert — flush left, ingen ikon */
        >
          <span className="text-body-sm font-bold text-ink">{overview.lead.title}</span>
        </Link>

        {/* Øvrige lenker — hover-bg går til høyre kolonne-divider. */}
        {overview.links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className="-mr-8 flex h-[34px] items-center rounded-1 pl-0 pr-[42px] transition-colors hover:bg-canvas" /* paper-exact: brukerjustert — flush left, ingen ikon */
          >
            <span className="text-body-sm text-ink">{link.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KNIVTYPER-kolonne (groups[0]) — icon+text, Se alle
// ---------------------------------------------------------------------------

function KnivtyperCol({ group, onNavigate }: { group: NavLinkGroup; onNavigate?: () => void }) {
  return (
    <div className="w-60 shrink-0 border-r border-canvas pb-10 pl-8 pr-8 pt-9">
      <ColLabelMerker href={group.seeAll?.href} onNavigate={onNavigate}>
        {group.title}
      </ColLabelMerker>

      <div className="flex flex-col">
        {group.links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className="-mx-8 flex h-[34px] items-center rounded-1 pl-8 pr-[42px] transition-colors hover:bg-canvas" /* paper-exact: brukerjustert — flush left, ingen ikon */
          >
            <span className="text-body-sm text-ink">{link.label}</span>
          </Link>
        ))}
      </div>

      {group.seeAll && (
        <SeeAllLink href={group.seeAll.href} label={group.seeAll.label} onNavigate={onNavigate} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SMEDER-kolonne (groups[1]) — plain text, Se alle
// ---------------------------------------------------------------------------

function SmederCol({ group, onNavigate }: { group: NavLinkGroup; onNavigate?: () => void }) {
  return (
    <div className="w-60 shrink-0 border-r border-canvas pb-10 pl-8 pr-8 pt-9">
      <ColLabelMerker href={group.seeAll?.href} onNavigate={onNavigate}>
        {group.title}
      </ColLabelMerker>

      <div className="flex flex-col">
        {group.links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className="-mx-8 flex h-[34px] items-center rounded-1 pl-8 pr-[42px] text-body-sm text-ink transition-colors hover:bg-canvas" /* paper-exact: brukerjustert — flush left */
          >
            {link.label}
          </Link>
        ))}
      </div>

      {group.seeAll && (
        <SeeAllLink href={group.seeAll.href} label={group.seeAll.label} onNavigate={onNavigate} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MERKER-kolonne (groups[2]) — 14px regular, h-34 rader, Se alle
// ---------------------------------------------------------------------------

function MerkerCol({ group, onNavigate }: { group: NavLinkGroup; onNavigate?: () => void }) {
  return (
    <div className="w-60 shrink-0 border-r border-divider p-8">
      <ColLabelMerker href={group.seeAll?.href} onNavigate={onNavigate}>
        {group.title}
      </ColLabelMerker>

      <div className="flex flex-col">
        {group.links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className="-mx-8 flex h-[34px] items-center rounded-1 px-8 text-body-sm text-ink transition-colors hover:bg-canvas"
          >
            {link.label}
          </Link>
        ))}
      </div>

      {group.seeAll && (
        <div className="flex h-[30px] items-center">
          <Link
            href={group.seeAll.href}
            onClick={onNavigate}
            className="text-body-xs font-bold text-aka hover:underline"
          >
            {group.seeAll.label}
          </Link>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EDITORIAL-kolonne — mørkt bildekort + service-snarveier
// ---------------------------------------------------------------------------

function EditorialColV2({ editorial, onNavigate }: { editorial: NavEditorial; onNavigate?: () => void }) {
  return (
    <div className="flex flex-1 flex-col gap-sp-3 pb-8 pl-8 pt-8">

      {/* Mørkt bildekort (Paper E6L-1) */}
      <Link
        href={editorial.card.cta.href}
        onClick={onNavigate}
        className="group relative flex flex-1 items-end overflow-hidden rounded-1 bg-kuro"
        style={{ minHeight: '280px', padding: '28px' }}
        aria-label={`${editorial.card.title} — ${editorial.card.cta.label}`}
      >
        {/* Gradient-overlay — sort bunn mot transparent */}
        <div
          className="absolute inset-0"
          aria-hidden
          style={{
            background: 'linear-gradient(0deg, rgba(0,0,0,0.70) 0%, rgba(0,0,0,0) 60%)',
          }}
        />

        {/* Kanji-dekorasjon */}
        {editorial.card.decorative && (
          <span
            className="absolute right-7 top-1/2 -translate-y-1/2 font-serif font-light text-white/10 select-none"
            style={{ fontFamily: '"Noto Serif JP", serif', fontSize: '96px', lineHeight: 1 }}
            aria-hidden
          >
            {editorial.card.decorative}
          </span>
        )}

        {/* Innhold */}
        <div className="relative flex flex-col gap-[10px]">
          <span
            className="font-bold uppercase text-white/60"
            style={{ fontSize: '10px', letterSpacing: '0.12em', lineHeight: '12px' }}
          >
            {editorial.title}
          </span>
          <span
            className="font-bold text-white"
            style={{ fontSize: '20px', lineHeight: '120%' }}
          >
            {editorial.card.title}
          </span>
          {editorial.card.body && (
            <span
              className="text-white/75"
              style={{ fontSize: '13px', lineHeight: '150%' }}
            >
              {editorial.card.body}
            </span>
          )}
          {/* CTA-knapp (Paper E6R-1: rounded-1, py-10 px-20, bg-aka) */}
          <div className="mt-1 w-fit rounded-1 bg-aka px-5 py-2.5 transition-colors group-hover:bg-aka-dark">
            <span className="text-body-xs font-bold text-white">
              {editorial.card.cta.label}
            </span>
          </div>
        </div>
      </Link>

      {/* Service-snarveier (Paper E6T-1) */}
      {editorial.services && (
        <div className="flex shrink-0 gap-sp-2">
          {editorial.services.links.slice(0, 2).map((link, i) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
              className="flex flex-1 items-center gap-3 rounded-1 border border-divider px-sp-3 py-3 transition-colors hover:bg-canvas"
            >
              {i === 0 ? <IconServiceOslo /> : <IconServicePost />}
              <div className="flex flex-col gap-[2px]">
                <span className="text-body-xs font-bold text-ink">{link.label}</span>
                <span className="text-muted-sm text-ink-muted">
                  {i === 0 ? 'Ta med kniven din' : 'Send oss kniven din'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hovedkomponent
// ---------------------------------------------------------------------------

export function MegaMenu({
  mega,
  open,
  id,
  rootRef,
  onMouseEnter,
  onMouseLeave,
  onNavigate,
}: MegaMenuProps) {
  const { overview, groups, editorial } = mega;
  const [g0, g1, g2] = groups;

  const hasContent = overview || groups.length > 0 || editorial;
  if (!hasContent) return null;

  return (
    <div
      ref={rootRef}
      id={id}
      role="region"
      aria-hidden={!open}
      data-state={open ? 'open' : 'closed'}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        clipPath: 'inset(0 -100px -100px -100px)',
        boxShadow: '0px 8px 24px rgba(0,0,0,0.07)',
      }}
      className={cn(
        'absolute left-0 right-0 top-full mt-px z-50',
        'flex bg-surface',
        'border-t border-b border-divider',
        'px-sp-7',
        'transition-opacity duration-150',
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
      )}
    >
      {overview && <Oppdag overview={overview} onNavigate={onNavigate} />}
      {g0 && <KnivtyperCol group={g0} onNavigate={onNavigate} />}
      {g1 && <SmederCol group={g1} onNavigate={onNavigate} />}
      {g2 && <MerkerCol group={g2} onNavigate={onNavigate} />}
      {editorial && <EditorialColV2 editorial={editorial} onNavigate={onNavigate} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ikoner (Paper-exact SVG paths fra get_jsx)
// ---------------------------------------------------------------------------

/** Knivsliping i Oslo — circle+check (Paper E6V-1) */
function IconServiceOslo() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="shrink-0" aria-hidden>
      <circle cx="10" cy="10" r="9" stroke="#1A1A1A" strokeWidth="1.5" />
      <path d="M7 10l2 2 4-4" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Knivsliping per post — envelope/card (Paper E72-1) */
function IconServicePost() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="shrink-0" aria-hidden>
      <rect x="3" y="5" width="14" height="11" rx="1.5" stroke="#1A1A1A" strokeWidth="1.5" />
      <path d="M3 8h14" stroke="#1A1A1A" strokeWidth="1.5" />
    </svg>
  );
}
