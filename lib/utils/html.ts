/**
 * HTML-hjelpere for server-side behandling av WooCommerce-innhold.
 *
 * WooCommerce lagrer description/short_description som rå HTML med
 * HTML-entiteter (både named og numeriske). Disse må dekodes før rendering.
 */

/**
 * Dekoder vanlige HTML-entiteter — named og numeriske (&#N; fallback).
 * Samme liste som lib/wp/menus.ts + generisk &#N;-handler.
 */
export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&oslash;/g, 'ø')
    .replace(/&Oslash;/g, 'Ø')
    .replace(/&aelig;/g, 'æ')
    .replace(/&AElig;/g, 'Æ')
    .replace(/&aring;/g, 'å')
    .replace(/&Aring;/g, 'Å')
    .replace(/&ndash;/g, '–')
    .replace(/&#8211;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&#8212;/g, '—')
    .replace(/&rarr;/g, '→')
    .replace(/&#8594;/g, '→')
    .replace(/&hellip;/g, '…')
    .replace(/&#8230;/g, '…')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

/**
 * Stripper HTML-tagger og dekoder entiteter. Brukes der ren tekst er
 * nødvendig (spec-linjer, meta-beskrivelser).
 */
export function stripHtml(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

/**
 * Saniterer HTML for trygg rendering med dangerouslySetInnerHTML.
 * Fjerner <script>, <style>, event-attributter og javascript:-protokoll.
 * Dekoder også entiteter i tekst-noder.
 *
 * NB: Ikke en fullstendig XSS-saniterer — bruk DOMPurify i browser-kontekst
 * hvis innholdet kan komme fra ukjente kilder.
 */
export function sanitizeHtml(html: string): string {
  return html
    // Fjern script- og style-blokker
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Fjern event-attributter (onclick, onerror etc.)
    .replace(/\s+on\w+="[^"]*"/gi, '')
    .replace(/\s+on\w+='[^']*'/gi, '')
    // Fjern javascript:-protokoll
    .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')
    // Dekod entiteter (men ikke de vi trenger som HTML-struktur)
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      // Ikke dekod < > " & ' — de er del av HTML-strukturen
      if ([60, 62, 34, 38, 39].includes(n)) return `&#${code};`;
      return String.fromCharCode(n);
    })
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&nbsp;/g, ' ')
    .replace(/&hellip;/g, '…')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»');
}
