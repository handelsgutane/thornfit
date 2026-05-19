-- Migration: fjern kunstig hardkodet overview fra nav_primary overlay
--
-- Bakgrunn: DEFAULT_NAV_OVERLAY i lib/nav/default.ts hadde en hardkodet
-- overview-kolonne for /knivtyper med lenker som ikke eksisterer (/bestselgere,
-- /smeder, /custom, /knivsett). Resolveren auto-bygger overview fra
-- wp_menus-dataen hvis override?.overview er undefined, så vi trenger bare
-- å fjerne den kunstige blokken fra databasen.
--
-- Etter migreringen: neste request bygger ny resolved nav fra wp_menus +
-- oppdatert overlay, cacher i Redis (KEY_VERSION v5 invaliderer v4-nøkkelen).

UPDATE site_config
SET value = jsonb_set(
  value::jsonb,
  '{itemOverrides,/knivtyper}',
  (value::jsonb -> 'itemOverrides' -> '/knivtyper') - 'overview'
)
WHERE key = 'nav_primary'
  AND value::jsonb -> 'itemOverrides' -> '/knivtyper' ? 'overview';
