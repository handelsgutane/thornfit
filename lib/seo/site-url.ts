/**
 * Kanonisk site-URL avledet fra `NEXT_PUBLIC_SITE_URL`.
 *
 * Brukes til ABSOLUTTE URLer i JSON-LD (schema.org krever absolutte URLer —
 * relative resolves ikke). Faller tilbake til localhost i dev.
 *
 * NB: For `<link rel="canonical">` og OG-URLer i Metadata-objekter trenger du
 * IKKE denne — `metadataBase` i `app/layout.tsx` resolver relative `canonical`-
 * verdier automatisk. Denne er kun for steder der vi bygger absolutte URLer
 * manuelt (typisk `dangerouslySetInnerHTML` med JSON-LD).
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
