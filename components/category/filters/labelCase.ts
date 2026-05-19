/**
 * filterLabelCase — delt tittel-/verdi-casing for alle filter-komponenter
 * (desktop + mobil). Målet: konsistent "Stor forbokstav, resten liten", men
 * bevar akronymer og tekniske stål-/hardhet-koder.
 *
 * Regler per ord:
 *   1. Inneholder ordet siffer OG minst én bokstav (f.eks. "AUS-8", "S30V",
 *      "VG10", "440C", "60-62") → behold som-i-datastrømmen. Dette er alltid
 *      en teknisk kode der brukeren forventer original casing.
 *   2. Ordet er rent bokstav-ord, ≥2 tegn, og alle bokstaver er UPPERCASE i
 *      originaldata, og ordet er ≤4 tegn → akronym (HRC, VG, AUS, NSF, ISO).
 *      Behold uppercase.
 *   3. Ellers → lowercase hele ordet.
 *
 * Etter per-ord-behandling uppercase-er vi første alfabetiske tegn i hele
 * strengen (norsk locale så æ/ø/å/umlauter håndteres riktig). Dette gir:
 *
 *   "HRC 60-62"         → "HRC 60-62"
 *   "WÜSTHOF"           → "Wüsthof"
 *   "wüsthof classic"   → "Wüsthof classic"
 *   "ATS34"             → "ATS34"
 *   "aus-8"             → "AUS-8" (Woo lagrer ofte som "AUS-8" eller "aus-8";
 *                        vi går på den originale tokenen, så hvis dataen er
 *                        "aus-8" forblir den "aus-8" etter ord-behandling og
 *                        blir til "Aus-8" etter første-bokstav-up. Det er et
 *                        data-issue — fiks kilden hvis viktig.)
 *   "S30V premium"      → "S30V premium" (S30V bevart, premium lowercased)
 *   "60-62 HRC"         → "60-62 HRC"  (60-62 bevart, HRC bevart)
 *   "Extra sharp"       → "Extra sharp" (alle ord normal casing, første-char
 *                        allerede upper)
 */
export function filterLabelCase(value: string): string {
  if (!value) return value;
  // Split på whitespace, behold separatorene så join ikke ødelegger spacing.
  const tokens = value.split(/(\s+)/);
  const processed = tokens.map((token) => {
    if (/^\s*$/.test(token)) return token;

    // Regel 1: inneholder både siffer og bokstav → teknisk kode, behold.
    const hasDigit = /\d/.test(token);
    const hasLetter = /[A-Za-zÀ-ÿ]/.test(token);
    if (hasDigit && hasLetter) return token;

    // Regel 2: rent bokstav-ord, alle bokstaver UPPERCASE i originalen,
    // og ≤4 bokstaver → akronym.
    const letters = token.replace(/[^A-Za-zÀ-ÿ]/g, '');
    if (letters.length >= 2 && letters.length <= 4) {
      const isAllCaps = letters === letters.toLocaleUpperCase('nb-NO');
      if (isAllCaps) return token;
    }

    // Regel 3: lowercase hele ordet.
    return token.toLocaleLowerCase('nb-NO');
  });

  const joined = processed.join('');

  // Uppercase første alfabetiske tegn i den samlede strengen.
  const firstAlphaIdx = joined.search(/[A-Za-zÀ-ÿ]/);
  if (firstAlphaIdx < 0) return joined;
  return (
    joined.slice(0, firstAlphaIdx) +
    joined.charAt(firstAlphaIdx).toLocaleUpperCase('nb-NO') +
    joined.slice(firstAlphaIdx + 1)
  );
}
