/**
 * Bygg innholdsfortegnelse (TOC) fra en HTML-streng.
 *
 * Parser ut alle `<h2>`-elementer fra rendret artikkel-content, genererer
 * URL-vennlige slugs og returnerer en flat liste. Server-bruk: kalles av
 * artikkel-page.tsx før innhold rendres så vi kan sende både TOC-arrayet
 * og den modifiserte HTML-en (med id-er på h2-er) til klienten.
 *
 * Hvorfor regex-basert: vi vil ikke dra inn en full HTML-parser bare for
 * dette. h2-mønsteret er enkelt nok at regex er trygt — content kommer fra
 * vår egen WP-installasjon og er allerede sanitized.
 */

export interface TocItem {
  /** URL-vennlig id, f.eks. "japansk-vs-tysk-stal" */
  id: string;
  /** Synlig label, f.eks. "Japansk vs. tysk stål" */
  label: string;
}

/** Match `<h2[^>]*>...</h2>` — non-greedy så vi får én h2 av gangen. */
const H2_REGEX = /<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/gi;

/**
 * Slugify til norsk-vennlig id. Behandler æ/ø/å, fjerner skiltegn,
 * erstatter mellomrom med bindestrek. Faller tilbake til "section-N"
 * hvis resultatet er tomt (f.eks. h2 med kun et kanji-tegn).
 */
function slugify(text: string): string {
  const norm = text
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/[^\w\s-]/g, '') // fjern punktum, kolon, parenteser etc.
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return norm;
}

/** Strip alle inner-HTML-tagger og whitespace-collapse til ren label. */
function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Plukk TOC-items fra HTML. Idempotent — hvis innholdet allerede har
 * `id`-attributter, gjenbruker vi dem så TOC-lenker er stabile.
 */
export function extractToc(html: string | null | undefined): TocItem[] {
  if (!html) return [];
  const items: TocItem[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  let counter = 1;

  // Reset lastIndex for å være safe ved gjenbruk.
  H2_REGEX.lastIndex = 0;

  while ((match = H2_REGEX.exec(html)) !== null) {
    const attrs = match[1] ?? '';
    const inner = match[2] ?? '';
    const label = plainText(inner);
    if (!label) {
      counter += 1;
      continue;
    }

    // Plukk eksisterende id hvis den finnes.
    const idMatch = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
    let id = idMatch?.[1] ?? slugify(label);
    if (!id) id = `section-${counter}`;

    // Dedupliser ved kollisjon — sjelden, men kan skje med to h2-er som har
    // samme tittel ("Eksempler", "Eksempler"). Append -2, -3, ...
    let unique = id;
    let n = 2;
    while (seen.has(unique)) {
      unique = `${id}-${n}`;
      n += 1;
    }
    seen.add(unique);

    items.push({ id: unique, label });
    counter += 1;
  }

  return items;
}

/**
 * Injiser id-attributter på h2-elementer som mangler dem. Bruker samme
 * slugify-logikk som `extractToc` så TOC-lenker peker på de injiserte id-ene.
 *
 * Returnerer modifisert HTML klar til å sendes inn i `dangerouslySetInnerHTML`.
 * Idempotent: h2-er som allerede har id beholdes uendret.
 */
export function injectHeadingIds(html: string | null | undefined): string {
  if (!html) return '';
  const seen = new Set<string>();
  let counter = 1;

  return html.replace(H2_REGEX, (full, attrs: string | undefined, inner: string) => {
    const a = attrs ?? '';
    if (/\bid\s*=/.test(a)) {
      // h2 har allerede id — registrer den så ekstra duplikater kan dedupes.
      const m = a.match(/\bid\s*=\s*["']([^"']+)["']/i);
      if (m) seen.add(m[1]);
      counter += 1;
      return full;
    }
    const label = plainText(inner);
    let id = slugify(label) || `section-${counter}`;
    let unique = id;
    let n = 2;
    while (seen.has(unique)) {
      unique = `${id}-${n}`;
      n += 1;
    }
    seen.add(unique);
    counter += 1;
    return `<h2${a} id="${unique}">${inner}</h2>`;
  });
}
