/**
 * Pure resolver: `resolvePrimaryNav({ desktopMenu, mobileMenu, overlay })`
 * → `NavPrimary`.
 *
 * Bygger det renderte nav-treet fra:
 *   - `desktopMenu` (wp_menus-snapshot for "main menu" — ID 536)
 *   - `mobileMenu`  (wp_menus-snapshot for "Mobilmeny"  — ID 589)
 *   - `overlay`     (editorial site_config.nav_primary, NavOverlaySchema)
 *
 * Har ingen IO — all fetching skjer i `lib/nav/fetch.ts`. Dette gjør funksjonen
 * trivielt testbar og deterministisk.
 *
 * Algoritme:
 *   1. Flat WP-items → hierarkisk tre via `parent`-pekere.
 *   2. Level 0-items blir NavItem (top-level label + href).
 *   3. Level 1-items samles per top-level som NavLinkGroup, med en
 *      `seeAll`-lenke hvis level-1 selv har en destinasjon — men kun hvis
 *      level-1 har barn som fyller `links`-arrayen (ellers blir gruppen tom).
 *   4. Level 2-items blir NavLink-entries i gruppens `links`.
 *   5. Items dypere enn level 2 ignoreres i desktop (mega-menyen har 3 nivåer).
 *      Mobile-menyen har bare level 0/1 i vår UX (drawer viser én nivå ned per
 *      accordion), så level 2 flates ut / ignoreres der også.
 *   6. Overlay slås på per top-level href:
 *        - `label` overstyrer WP-tittel
 *        - `accent` flagger level-0 som rød
 *        - `hidden: true` fjerner item helt
 *        - `overview` / `editorial` injiseres i mega
 *        - `groupOverrides[childHref]` endrer gruppe-tittel, seeAll, eller
 *          skjuler gruppen
 *   7. `virtualItems` fra overlay injiseres i items-listen i henhold til
 *      `position` ('start', 'end', eller numerisk indeks).
 *
 * Idempotent og pure: samme input → samme output. Logger aldri. Kaster aldri
 * (faller alltid tilbake til defaults).
 */

import { sanitizeMenuTitle, type MenuItem, type MenuSnapshot } from '@/lib/wp/menus';

import type {
  NavEditorial,
  NavItem,
  NavLink,
  NavLinkGroup,
  NavOverlay,
  NavOverviewColumn,
  NavPrimary,
} from './schema';
import { NAV_SCHEMA_VERSION } from './schema';

// ---------- Types ----------------------------------------------------------

export interface ResolveInputs {
  desktopMenu: MenuSnapshot | null;
  mobileMenu: MenuSnapshot | null;
  overlay: NavOverlay;
}

/** Intermediate tree node brukt internt. */
interface TreeNode {
  item: MenuItem;
  children: TreeNode[];
}

// ---------- Public API -----------------------------------------------------

/**
 * Hovedinngangen. Returnerer en fullt validerbar `NavPrimary`. Hvis både
 * desktop- og mobile-menyene er `null`, produserer vi en tom liste —
 * kalleren (fetch.ts) kaster før vi kommer hit (ingen resolve uten items).
 */
export function resolvePrimaryNav(inputs: ResolveInputs): NavPrimary {
  const { desktopMenu, mobileMenu, overlay } = inputs;

  const desktopItems = desktopMenu ? resolveItems(desktopMenu.items, overlay, 'desktop') : [];
  const mobileItems = mobileMenu
    ? resolveItems(mobileMenu.items, overlay, 'mobile')
    : desktopItems; // fallback — hvis mobil-menyen ikke finnes, speil desktop

  return {
    version: NAV_SCHEMA_VERSION,
    items: desktopItems,
    mobileItems,
    utility: overlay.utility,
  };
}

// ---------- Core pipeline --------------------------------------------------

function resolveItems(
  flatItems: MenuItem[],
  overlay: NavOverlay,
  variant: 'desktop' | 'mobile',
): NavItem[] {
  const roots = buildTree(flatItems);

  // Map level-0 → NavItem, filtrer skjulte.
  const items: NavItem[] = [];
  for (const root of roots) {
    const navItem = toNavItem(root, overlay, variant);
    if (navItem) items.push(navItem);
  }

  // Injiser virtuelle items i angitt posisjon.
  return injectVirtualItems(items, overlay);
}

function toNavItem(
  node: TreeNode,
  overlay: NavOverlay,
  variant: 'desktop' | 'mobile',
): NavItem | null {
  const { item, children } = node;
  const href = item.path;
  const override = overlay.itemOverrides[href];

  if (override?.hidden) return null;

  // Overlay-labels er redaksjonelle og antas rene, men fallbackene fra WP
  // (item.title) kan inneholde inline HTML på eksisterende snapshots som ble
  // lagret før `normalize()` stripte tags. Sanitér defensivt her også.
  const label = override?.label ?? sanitizeMenuTitle(item.title);
  // Klasser fra WP admin — brukes til å flagge accent uten overlay.
  const wpAccent = item.classes.includes('accent');
  const accent = override?.accent ?? wpAccent;

  const navItem: NavItem = {
    label,
    href,
    ...(accent ? { accent: true } : {}),
  };

  // Mega-menu bygges kun for desktop-varianten. Mobile rendres i drawer med
  // enklere accordion — den bruker bare label + href + children.
  if (variant === 'desktop') {
    const mega = buildMega(children, override, label, href);
    if (mega) navItem.mega = mega;
  } else {
    // Mobile: level 1-barn som en enkelt gruppe i `mega.groups[0]` så
    // MobileDrawer kan accordion-åpne dem uten spesial-casing.
    const mobileMega = buildMobileMega(children, override, label);
    if (mobileMega) navItem.mega = mobileMega;
  }

  return navItem;
}

// ---------- Desktop mega ---------------------------------------------------

function buildMega(
  level1Nodes: TreeNode[],
  override: NonNullable<NavOverlay['itemOverrides'][string]> | undefined,
  topLevelLabel: string,
  topLevelHref: string,
): NavItem['mega'] | undefined {
  // Editorial-kortet kommer kun fra overlay — WP-menyen har ikke noe
  // konsept av "redaksjonelt kort", så vi kan ikke utlede det fra items.
  const editorial: NavEditorial | undefined = override?.editorial;

  const rawGroups: NavLinkGroup[] = [];
  for (const l1 of level1Nodes) {
    const group = buildGroup(l1, override);
    if (group) rawGroups.push(group);
  }

  const hasContent = rawGroups.length > 0 || editorial || override?.overview;
  if (!hasContent) return undefined;

  // Overview-kolonnen (venstre sidebar):
  //   1. Overlay vinner hvis den definerer en overview (f.eks. "Kniver" med
  //      kuratert "Alle kjøkkenkniver" + bestselgere/smeder/knivsett).
  //   2. Ellers promoterer vi `rawGroups[0]` til sidebar: hele første level-1-
  //      gruppa blir sidebar-innholdet — dens tittel blir lead-title, dens
  //      seeAll-href blir lead-href, dens level-2-links blir curated-listen.
  //      Dette gir alle kategorier samme 4-kolonne-layout som "Kniver", og
  //      første objekt beholder sin identitet (tidligere ble tittelen erstattet
  //      av generisk "Alle [kategori]" → "første objekt" følte seg ikke lagt
  //      inn der).
  //   3. Hvis ingen grupper finnes (bare editorial), dropper vi overview helt.
  let overview: NavOverviewColumn | undefined;
  let groups = rawGroups;

  if (override?.overview) {
    overview = override.overview;
  } else if (rawGroups.length > 0) {
    const [first, ...rest] = rawGroups;
    // Lead-href: foretrekk gruppens egen seeAll (= level-1-path), fall tilbake
    // til første link, til slutt top-level-href. Dette gjør at sidebar-lead
    // peker på den faktiske seksjonen vi viser, ikke på parent-kategorien.
    const leadHref =
      first.seeAll?.href ?? first.links[0]?.href ?? topLevelHref;
    overview = {
      title: 'Oversikt',
      lead: {
        title: first.title,
        href: leadHref,
      },
      // Schema tillater maks 12. WP-kategorier med flere enn 12 level-2-barn
      // er sjeldne; tar vi flere sprenger vi validering.
      links: first.links.slice(0, 12),
    };
    groups = rest;
  }

  // Schema.NavMegaSchema.groups.max(4). Hvis WP-menyen har flere level-1
  // siblings enn det, tar vi de fire første — overflow er en redaksjonell
  // feil i WP-admin og bør logges andre steder, ikke krasje render.
  return { overview, groups: groups.slice(0, 4), editorial };
}

function buildGroup(
  level1: TreeNode,
  override: NonNullable<NavOverlay['itemOverrides'][string]> | undefined,
): NavLinkGroup | null {
  const childHref = level1.item.path;
  const groupOverride = override?.groupOverrides?.[childHref];

  if (groupOverride?.hidden) return null;

  const cleanL1Title = sanitizeMenuTitle(level1.item.title);

  const links: NavLink[] = level1.children
    .slice(0, 30) // match schema max(30)
    .map((l2) => ({ label: sanitizeMenuTitle(l2.item.title), href: l2.item.path }));

  // Hvis level-1 ikke har noen barn, gir vi den likevel en gruppe bestående
  // av bare level-1 selv som en lenke — ellers blir mega tom.
  if (links.length === 0) {
    return {
      title: groupOverride?.title ?? cleanL1Title,
      links: [{ label: cleanL1Title, href: level1.item.path }],
      seeAll: groupOverride?.seeAll,
    };
  }

  return {
    title: groupOverride?.title ?? cleanL1Title,
    links,
    // seeAll-rekkefølge:
    //   1. eksplisitt overlay-overstyring
    //   2. level-1-pathen (vanligste tilfelle — WP gir oss kategori-URL)
    //   3. fallback til første link i gruppen så kolonne-overskriften alltid
    //      blir klikkbar (mega-meny krever det per ADR-design).
    // Tidligere "Se alle i {title} →" — `Se alle`-prefikset ble fjernet
    // etter at CTA-en fikk pill-bakgrunn (MegaMenu E3-0).
    seeAll:
      groupOverride?.seeAll ??
      (level1.item.path
        ? { label: `${cleanL1Title} →`, href: level1.item.path }
        : links.length > 0
          ? { label: `${cleanL1Title} →`, href: links[0].href }
          : undefined),
  };
}

// ---------- Mobile mega ----------------------------------------------------

/**
 * Mobile rendres i MobileDrawer som én accordion per top-level. Under åpnet
 * accordion vises level-1-barn som en flat lenke-liste. Vi mapper derfor
 * level-1 direkte til én enkelt NavLinkGroup (og dropper level-2 for ikke
 * å overbelaste drawer-en med scroll).
 */
function buildMobileMega(
  level1Nodes: TreeNode[],
  override: NonNullable<NavOverlay['itemOverrides'][string]> | undefined,
  topLevelLabel: string,
): NavItem['mega'] | undefined {
  if (level1Nodes.length === 0) return undefined;

  const links: NavLink[] = level1Nodes
    .slice(0, 30)
    .map((l1) => ({ label: sanitizeMenuTitle(l1.item.title), href: l1.item.path }));

  // Hvis overlayen har overview, legg lead-lenken øverst også i mobile (så
  // brukeren kommer til landingssiden før kategoriene).
  if (override?.overview?.lead) {
    const lead = override.overview.lead;
    links.unshift({ label: lead.title, href: lead.href });
  }

  return {
    groups: [
      {
        // MobileDrawer rendrer ikke group.title, men NavLinkGroupSchema krever
        // min(1) char. Bruk top-level-label som stabil placeholder.
        title: override?.label ?? topLevelLabel,
        links,
      },
    ],
  };
}

// ---------- Virtual items --------------------------------------------------

function injectVirtualItems(items: NavItem[], overlay: NavOverlay): NavItem[] {
  if (overlay.virtualItems.length === 0) return items;

  // Del inn i start/end/numerisk.
  const starts: NavItem[] = [];
  const ends: NavItem[] = [];
  const numbered: Array<{ index: number; item: NavItem }> = [];

  for (const v of overlay.virtualItems) {
    const navItem: NavItem = {
      label: v.label,
      href: v.href,
      ...(v.accent ? { accent: true } : {}),
    };
    if (v.position === 'start') starts.push(navItem);
    else if (v.position === 'end') ends.push(navItem);
    else numbered.push({ index: v.position, item: navItem });
  }

  let result: NavItem[] = [...starts, ...items, ...ends];

  // Numeriske posisjoner slås inn etter alle start/end er plassert. Sorter
  // fallende så innsetting ikke forskyver påfølgende indekser.
  numbered.sort((a, b) => b.index - a.index);
  for (const { index, item } of numbered) {
    const clamped = Math.max(0, Math.min(index, result.length));
    result = [...result.slice(0, clamped), item, ...result.slice(clamped)];
  }

  // Respekter max(12) fra schema.
  return result.slice(0, 12);
}

// ---------- Tree building --------------------------------------------------

/**
 * Bygger hierarki fra flat `MenuItem[]` basert på `parent`-peker. Items er
 * allerede sortert av `fetchMenuSnapshot` — vi bevarer rekkefølgen.
 *
 * WP bruker `parent: 0` for top-level. Hvis en item peker på en parent som
 * ikke finnes (f.eks. parent ble slettet men cache er gammel), behandles den
 * som top-level — bedre å vise den enn å droppe den stille.
 */
export function buildTree(flat: MenuItem[]): TreeNode[] {
  const byId = new Map<number, TreeNode>();
  for (const item of flat) {
    byId.set(item.id, { item, children: [] });
  }

  const roots: TreeNode[] = [];
  for (const item of flat) {
    const node = byId.get(item.id);
    if (!node) continue;
    const parent = item.parent > 0 ? byId.get(item.parent) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
