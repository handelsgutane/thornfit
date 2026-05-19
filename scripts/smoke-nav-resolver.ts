/**
 * Smoke-test: henter WP-menyene 536/589 fra prod og kjører dem gjennom
 * resolveren med default-overlay. Printer det resolverte treet.
 *
 *   npx tsx scripts/smoke-nav-resolver.ts
 *
 * Bekrefter at:
 *   - WP application-password-auth virker
 *   - Pagineringen henter alle items
 *   - Tree-building funker (ingen orphan items)
 *   - Resolveren produserer en validerbar NavPrimary
 */

import { DEFAULT_NAV_OVERLAY } from '@/lib/nav/default';
import { resolvePrimaryNav } from '@/lib/nav/resolve';
import { NavPrimarySchema } from '@/lib/nav/schema';
import { fetchMenuSnapshot } from '@/lib/wp/menus';

async function main() {
  console.log('Fetching WP menu 536 (main menu) + 589 (Mobilmeny)…');
  const [desktop, mobile] = await Promise.all([
    fetchMenuSnapshot(536),
    fetchMenuSnapshot(589),
  ]);

  console.log(`  main menu:  ${desktop.items.length} items`);
  console.log(`  Mobilmeny:  ${mobile.items.length} items`);

  const nav = resolvePrimaryNav({
    desktopMenu: desktop,
    mobileMenu: mobile,
    overlay: DEFAULT_NAV_OVERLAY,
  });

  const parsed = NavPrimarySchema.safeParse(nav);
  if (!parsed.success) {
    console.error('\n✗ Schema validation failed:');
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  console.log('\n✓ Schema valid.');
  console.log(`\nDesktop items (${nav.items.length}):`);
  for (const item of nav.items) {
    const groups = item.mega?.groups.length ?? 0;
    const overview = item.mega?.overview ? ' [overview]' : '';
    const editorial = item.mega?.editorial ? ' [editorial]' : '';
    const accent = item.accent ? ' [accent]' : '';
    console.log(
      `  • ${item.label.padEnd(24)} ${item.href.padEnd(30)} groups=${groups}${overview}${editorial}${accent}`,
    );
  }

  console.log(`\nMobile items (${nav.mobileItems.length}):`);
  for (const item of nav.mobileItems) {
    const groups = item.mega?.groups.length ?? 0;
    const links = item.mega?.groups[0]?.links.length ?? 0;
    console.log(
      `  • ${item.label.padEnd(24)} ${item.href.padEnd(30)} groups=${groups} links=${links}`,
    );
  }

  console.log('\nFirst desktop item drill-down:');
  const first = nav.items[0];
  if (first?.mega?.groups.length) {
    for (const group of first.mega.groups.slice(0, 3)) {
      console.log(`  [${group.title}]`);
      for (const link of group.links.slice(0, 5)) {
        console.log(`    - ${link.label} → ${link.href}`);
      }
      if (group.links.length > 5) console.log(`    … +${group.links.length - 5} more`);
    }
  }
}

main().catch((err) => {
  console.error('\n✗ Smoke test failed:', err);
  process.exit(1);
});
