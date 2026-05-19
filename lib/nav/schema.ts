/**
 * Zod-schema og TS-typer for primær-navigasjonen.
 *
 * Det er to relaterte schemas i denne fila:
 *
 *   1. `NavPrimarySchema` / `NavPrimary` — det FERDIG-RESOLVERTE objektet
 *      som rendres av Header/MegaMenu/MobileDrawer. Bygges av resolveren
 *      fra WP-menu-snapshot + overlay. Denne formen er også hva som caches
 *      i Redis. Hvis bygget feiler returnerer `getPrimaryNav()` `null` —
 *      det finnes ikke lenger noen hardkodet resolved-fallback.
 *
 *   2. `NavOverlaySchema` / `NavOverlay` — den REDAKSJONELLE overlay-blobben
 *      som ligger i `site_config.nav_primary`. Inneholder KUN ting WP-menyen
 *      ikke kan uttrykke: editorial-kort, utility-messages, accent-flag,
 *      overrides per URL, og virtuelle items (som "Tilbud" som ikke er i WP).
 *
 * Resolver (lib/nav/resolve.ts) tar { desktopMenu, mobileMenu, overlay } →
 * `NavPrimary`.
 *
 * Schema-versjonering:
 *   - v1: "resolved blob med hand-skrevne slugs" (deprekert — eksisterer kun
 *     for bakover-kompatibilitet under migrasjon).
 *   - v2 (nå): overlay er det som lagres i site_config; resolved blob bygges
 *     fra WP-menu-snapshot.
 */

import { z } from 'zod';

// ---------- Resolved NavPrimary (det som rendres) --------------------------

const NavLeadLinkSchema = z.object({
  title: z.string().min(1),
  sub: z.string().optional(),
  href: z.string().min(1),
});
export type NavLeadLink = z.infer<typeof NavLeadLinkSchema>;

const NavLinkSchema = z.object({
  label: z.string().min(1),
  href: z.string().min(1),
});
export type NavLink = z.infer<typeof NavLinkSchema>;

const NavSeeAllSchema = z.object({
  label: z.string().min(1),
  href: z.string().min(1),
});
export type NavSeeAll = z.infer<typeof NavSeeAllSchema>;

const NavOverviewColumnSchema = z.object({
  title: z.string().default('Oversikt'),
  lead: NavLeadLinkSchema,
  links: z.array(NavLinkSchema).max(12),
});
export type NavOverviewColumn = z.infer<typeof NavOverviewColumnSchema>;

const NavLinkGroupSchema = z.object({
  title: z.string().min(1),
  links: z.array(NavLinkSchema).max(30),
  seeAll: NavSeeAllSchema.optional(),
});
export type NavLinkGroup = z.infer<typeof NavLinkGroupSchema>;

const NavEditorialSchema = z.object({
  title: z.string().default('Redaksjonelt'),
  card: z.object({
    decorative: z.string().optional(), // f.eks. 包丁
    title: z.string().min(1),
    body: z.string().optional(),
    cta: NavLinkSchema,
  }),
  services: z
    .object({
      title: z.string().default('Tjenester'),
      links: z.array(NavLinkSchema).max(6),
    })
    .optional(),
});
export type NavEditorial = z.infer<typeof NavEditorialSchema>;

const NavMegaSchema = z.object({
  overview: NavOverviewColumnSchema.optional(),
  groups: z.array(NavLinkGroupSchema).max(4).default([]),
  editorial: NavEditorialSchema.optional(),
});
export type NavMega = z.infer<typeof NavMegaSchema>;

const NavItemSchema = z.object({
  label: z.string().min(1),
  href: z.string().min(1),
  /** Hvis true, rendres lenken i aka (rød) i header. F.eks. "Tilbud". */
  accent: z.boolean().optional(),
  mega: NavMegaSchema.optional(),
});
export type NavItem = z.infer<typeof NavItemSchema>;

export const NavPrimarySchema = z.object({
  version: z.number().int().positive(),
  /**
   * Items brukt av desktop-header + mega-menu. Bygges fra WP-meny 536
   * ("main menu").
   */
  items: z.array(NavItemSchema).min(1).max(12),
  /**
   * Items brukt av mobile-drawer. Bygges fra WP-meny 589 ("Mobilmeny").
   * Faller tilbake til `items` hvis mobile-menyen er utilgjengelig — så
   * komponenten slipper å håndtere undefined.
   */
  mobileItems: z.array(NavItemSchema).min(1).max(12),
  utility: z.array(z.string().min(1)).max(5).default([]),
});
export type NavPrimary = z.infer<typeof NavPrimarySchema>;

export const NAV_SCHEMA_VERSION = 2 as const;

// ---------- Editorial overlay (det som ligger i site_config) ---------------

/**
 * Overrides per top-level item, keyed by href (pathname). Resolveren slår
 * dette på top-level-items som matcher href-en (normalisert pathname).
 *
 * F.eks. hvis WP-menyen har "Kniver" med url `/knivtyper`, så kan overlayen
 * legge til editorial-kort, overview-lead, eller flagge det som hidden ved å
 * bruke nøkkel `/knivtyper`.
 */
const NavItemOverrideSchema = z.object({
  /** Overstyr label fra WP. Hvis tom, bruk WP-tittel. */
  label: z.string().min(1).optional(),
  /** Markér som accent-rød i desktop-nav. */
  accent: z.boolean().optional(),
  /** Skjul item fra nav. Brukes når WP-menyen inneholder noe vi ikke vil rendre. */
  hidden: z.boolean().optional(),
  /** Full overskrivning av `overview`-kolonnen i mega-menu. */
  overview: NavOverviewColumnSchema.optional(),
  /** Full overskrivning av `editorial`-kolonnen. */
  editorial: NavEditorialSchema.optional(),
  /**
   * Overstyr gruppe-titler (og eventuelt rekkefølge) basert på child-url.
   * Nøkkel = url på level-1 WP-item, verdi = { title?, seeAll? }.
   */
  groupOverrides: z
    .record(
      z.string(),
      z.object({
        title: z.string().optional(),
        seeAll: NavSeeAllSchema.optional(),
        hidden: z.boolean().optional(),
      }),
    )
    .optional(),
});
export type NavItemOverride = z.infer<typeof NavItemOverrideSchema>;

/**
 * Virtuelt item som legges til i nav uavhengig av WP-menyen. Brukes typisk
 * til `Tilbud` eller midlertidige kampanje-lenker som ikke bør ligge i WP.
 */
const NavVirtualItemSchema = z.object({
  label: z.string().min(1),
  href: z.string().min(1),
  accent: z.boolean().optional(),
  /**
   * Posisjon i items-listen. `end` (default) = legges etter alle WP-items;
   * `start` = før; eller en numerisk indeks for å pin-e til en bestemt plass.
   */
  position: z.union([z.literal('start'), z.literal('end'), z.number().int().min(0)]).default('end'),
});
export type NavVirtualItem = z.infer<typeof NavVirtualItemSchema>;

export const NavOverlaySchema = z.object({
  version: z.literal(2),
  /** Utility-bar-messages ("Gratis frakt ..."). */
  utility: z.array(z.string().min(1)).max(5).default([]),
  /** Overrides per href (pathname) — f.eks. `/knivtyper` → { editorial, overview, accent }. */
  itemOverrides: z.record(z.string(), NavItemOverrideSchema).default({}),
  /** Virtuelle items (f.eks. "Tilbud") som injiseres i items-listen. */
  virtualItems: z.array(NavVirtualItemSchema).max(5).default([]),
});
export type NavOverlay = z.infer<typeof NavOverlaySchema>;

export const NAV_OVERLAY_VERSION = 2 as const;
