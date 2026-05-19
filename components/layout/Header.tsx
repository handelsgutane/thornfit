/**
 * Header — top-level server-komponent. Fetcher nav-data og rendrer:
 *
 *   <UtilityBar />
 *   <HeaderDesktop />   (md:≥768)
 *   <HeaderMobile />    (<md)
 *   <MobileDrawer />    (aria-hidden inntil åpnet, men lever i DOM)
 *
 * `getPrimaryNav()` kan returnere `null` hvis wp_menus er tom eller Supabase
 * feiler. Da rendrer vi header UTEN nav-items — ingen fake meny. Det er et
 * bevisst valg: tidligere hadde vi en hardkodet `DEFAULT_NAV_PRIMARY`-fallback
 * som skjulte sync-feil ved å vise en statisk meny som så helt riktig ut.
 * Nå blir "meny mangler" umiddelbart synlig — og en tydelig dev-warning
 * rendres så vi fanger det tidlig.
 *
 * `MobileDrawerProvider` wrapper alt slik at `HeaderMobile` og `MobileDrawer`
 * kan snakke sammen via React context uten å lekke state opp i resten av
 * layout-et. Header-komponenten er dermed "self-contained" — `layout.tsx`
 * trenger bare å rendre `<Header />`.
 */

import { getPrimaryNav } from '@/lib/nav/fetch';

import { HeaderDesktop } from './HeaderDesktop';
import { HeaderMobile } from './HeaderMobile';
import { MobileDrawer, MobileDrawerProvider } from './MobileDrawer';
import { UtilityBar } from './UtilityBar';

/**
 * NB: `SearchOverlayProvider` ligger nå i `app/layout.tsx` slik at også
 * sider utenfor headeren (f.eks. /sok-siden's eget søkefelt) kan trigge
 * overlay-et. Mobile-drawer-providered forblir lokal — den brukes kun
 * av header-komponentene.
 */
export async function Header() {
  const nav = await getPrimaryNav();

  // Tom nav → render uten items. UtilityBar no-op-er selv ved tom messages-array.
  const items = nav?.items ?? [];
  const mobileItems = nav?.mobileItems ?? [];
  const utility = nav?.utility ?? [];

  return (
    <MobileDrawerProvider>
      <header className="sticky top-0 z-30 w-full">
        <UtilityBar
          desktopMessages={utility}
          mobileMessage="Gratis frakt over 2 500 kr"
        />
        <HeaderDesktop items={items} />
        <HeaderMobile />
        {nav === null && process.env.NODE_ENV !== 'production' && (
          <div
            role="status"
            className="border-b border-aka bg-aka/10 px-sp-4 py-sp-2 text-center text-body-xs font-bold text-aka"
          >
            Nav-data mangler — kjør <code>POST /api/cron/sync-wp-menus</code>.
            (Kun synlig i dev.)
          </div>
        )}
      </header>
      <MobileDrawer items={mobileItems} />
    </MobileDrawerProvider>
  );
}
