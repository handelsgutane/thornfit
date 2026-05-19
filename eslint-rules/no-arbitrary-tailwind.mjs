/**
 * Custom ESLint rule — `skn/no-arbitrary-tailwind`
 *
 * Mål: hindre regress til "AI slop" — hardkodede Tailwind arbitrary-verdier
 * som `text-[14px]`, `bg-[#F5F5F3]`, `h-[60px]`, `gap-[7px]` osv.
 *
 * Hver slik verdi skal enten
 *   (a) byttes ut med en design-token fra `app/globals.css` (f.eks. `text-body-sm`,
 *       `bg-unohana`, `h-header`, `gap-sp-2`), eller
 *   (b) merkes eksplisitt med en `/* paper-exact: <Paper-node-id> *\/` kommentar
 *       på samme linje som arbitrary-verdien.
 *
 * Tillatte arbitrary-verdier (flagges ikke):
 *   - CSS-funksjoner:          `w-[min(var(--x),90vw)]`, `[calc(100%-1rem)]`
 *   - CSS-variabel-referanser: `max-w-[--width-content]`
 *   - CSS-nøkkelord:           `auto`, `none`, `inherit`, `transparent`, …
 *   - Lister av ident uten tall: `transition-[transform,box-shadow]`
 *   - Alpha-modifikatorer:     `bg-black/[.04]` (Tailwind opacity, ikke arbitrary)
 *
 * Regelen skanner alle `Literal`- og `TemplateElement`-noder, ikke bare
 * `className`-attributter. Det dekker også helper-funksjoner som bygger
 * klasse-strenger (`navItemClasses` i PrimaryNav, `cn()`-lignende mønstre).
 *
 * Escape-hatch-syntaks:
 *   className="... gap-[5px] ..."  /* paper-exact: A4-0 *\/
 *
 * Kommentaren må inneholde `paper-exact:` og ligge på samme linje som match-et.
 * Vi bruker ikke proximity-window (±1) fordi kommentaren i praksis alltid står
 * rett etter className-strengen på samme linje — og en vid sjekk gir
 * false-negatives når én annotert linje "blør" over til nabo-linjer.
 */

// `<prefix>-[<value>]` hvor prefix ikke er prefixet med word-char eller slash.
// Slash-check ekskluderer Tailwind-opacity-syntax `bg-black/[.04]`.
const ARBITRARY_TOKEN_RE = /(?<![\w/])([a-z][\w-]*)-\[([^\]]+)\]/gi;

const CSS_FN_RE = /^(?:var|min|max|calc|clamp|env)\s*\(/i;
const COLOR_FN_RE = /^(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\s*\(/i;
const CSS_KEYWORD_RE =
  /^(?:auto|none|inherit|initial|unset|revert|transparent|currentColor)$/i;
const DIMENSION_RE = /^-?\d+(?:\.\d+)?[a-z%]*$/i;
const HEX_COLOR_RE = /^#[0-9a-f]{3,8}$/i;

function isTokenViolation(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  // CSS-variabel: `[--width-content]` — regnes som token-referanse, ikke
  // hardkodet verdi. Flagges ikke.
  if (value.startsWith('--')) return false;
  if (CSS_FN_RE.test(value)) return false;
  if (CSS_KEYWORD_RE.test(value)) return false;
  if (DIMENSION_RE.test(value)) return true;
  if (HEX_COLOR_RE.test(value)) return true;
  if (COLOR_FN_RE.test(value)) return true;
  return false;
}

function hasPaperExactOnLine(sourceCode, line) {
  const comments = sourceCode.getAllComments();
  for (const c of comments) {
    if (c.type !== 'Block') continue;
    if (!/paper-exact\s*:/i.test(c.value)) continue;
    // Samme linje = kommentaren starter eller slutter på linja med match-et.
    // Block-kommentarer kan være multi-line i teori, men paper-exact brukes
    // alltid som en ett-liner `/* paper-exact: XX-0 */` rett etter className.
    if (c.loc.start.line === line || c.loc.end.line === line) return true;
  }
  return false;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forby Tailwind arbitrary dimension/color-verdier. Bruk design-token fra `app/globals.css`, eller merk linjen med `/* paper-exact: <node-id> */`.',
    },
    messages: {
      arbitrary:
        'Tailwind arbitrary-verdi `{{token}}` er ikke tillatt. Bruk en design-token fra `app/globals.css`, eller annoter linjen med `/* paper-exact: <Paper-node-id> */` hvis verdien er paper-sporet.',
    },
    schema: [],
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    function check(node, raw) {
      if (typeof raw !== 'string' || raw.length === 0) return;
      ARBITRARY_TOKEN_RE.lastIndex = 0;
      let m;
      while ((m = ARBITRARY_TOKEN_RE.exec(raw)) !== null) {
        const value = m[2];
        if (!isTokenViolation(value)) continue;

        // Omtrentlig absolutt posisjon for match-start i kildefila
        // (for å slå opp riktig linje i forhold til kommentarene).
        const quoteOffset =
          node.type === 'Literal' || node.type === 'TemplateElement' ? 1 : 0;
        const absOffset = node.range[0] + quoteOffset + m.index;
        const loc =
          typeof sourceCode.getLocFromIndex === 'function'
            ? sourceCode.getLocFromIndex(absOffset)
            : null;
        const line = loc?.line ?? node.loc.start.line;

        if (hasPaperExactOnLine(sourceCode, line)) continue;

        context.report({
          node,
          loc: loc ?? node.loc,
          messageId: 'arbitrary',
          data: { token: `${m[1]}-[${value}]` },
        });
      }
    }

    return {
      Literal(node) {
        if (typeof node.value !== 'string') return;
        check(node, node.value);
      },
      TemplateElement(node) {
        const raw = node.value?.cooked ?? node.value?.raw;
        check(node, raw);
      },
    };
  },
};

export default rule;
