/**
 * UtilityBar — topp-bånd over headeren.
 *
 * Paper-ref: `9Q-0` i "Friendly canyon". Alle numeriske verdier fra computed styles.
 *
 * | Property        | Verdi                      | Token / teknikk           |
 * | --------------- | -------------------------- | ------------------------- |
 * | Height          | 28px                       | `h-utility-bar`           |
 * | Background      | #EEEDE9 / sumi-muted       | `bg-surface-muted`        |
 * | Border-bottom   | 1px divider (themed)       | `border-b border-divider` |
 * | Padding-inline  | 64px (desktop)             | `px-sp-7`                 |
 * | Gap             | 20px                       | `gap-5`                   |
 * | Text size       | 11px / 16px                | inline style via `--text-label`-variabelen |
 * | Text weight     | 700                        | `font-bold`               |
 * | Text colour     | ink (#1A1A1A)              | `text-ink`                |
 *
 * NB: Vi bruker IKKE `text-label`-utility-klassen for tekststørrelse fordi den
 * trekker inn `--text-label--letter-spacing` (0.1em) som er feil i denne
 * konteksten. I stedet leser vi font-size og line-height direkte fra
 * CSS-variablene via inline style — samme mønster som Tag og Pill.
 *
 * To separate containere — desktop og mobil kan ha helt ulikt innhold:
 *   - Desktop (md+): flex-rad med multiple meldinger og · separator
 *   - Mobil (<md):   sentrert enkelt-tekst
 *
 * Semantic tokens flipper automatisk med data-theme — se ADR-0008.
 * Server-komponent. Ingen state, ingen interaktivitet.
 */

import { Fragment } from 'react';

export type UtilityBarProps = {
  /** Meldinger vist på desktop (≥md). Skjules på mobil. */
  desktopMessages: ReadonlyArray<string>;
  /**
   * Enkeltmelding vist på mobil (<md). Skjules på desktop.
   * Kan være kortere enn desktop-meldingene siden det er plass til én linje.
   */
  mobileMessage?: string;
};

/** Felles tekst-stil: 11px fra token, bold, ink — uten letter-spacing. */
const textStyle = {
  fontSize: 'var(--text-label)',
  lineHeight: 'var(--text-label--line-height)',
} as const;

const textClass = 'font-bold text-ink';

export function UtilityBar({ desktopMessages, mobileMessage }: UtilityBarProps) {
  const hasDesktop = desktopMessages.length > 0;
  const hasMobile = Boolean(mobileMessage);

  if (!hasDesktop && !hasMobile) return null;

  return (
    <div
      role="complementary"
      aria-label="Kampanje- og serviceinformasjon"
      className="h-utility-bar bg-surface md:bg-surface-muted border-b border-divider"
    >
      {/* ---- Desktop (≥md): multiple meldinger med · separator ---- */}
      {hasDesktop && (
        <div className="mx-auto hidden h-full max-w-(--width-content) items-center justify-center gap-5 px-sp-7 md:flex">
          {desktopMessages.map((msg, i) => (
            <Fragment key={msg}>
              {i > 0 && (
                <span aria-hidden style={textStyle} className={textClass}>·</span>
              )}
              <span style={textStyle} className={textClass}>{msg}</span>
            </Fragment>
          ))}
        </div>
      )}

      {/* ---- Mobil (<md): én sentrert tekst ---- */}
      {hasMobile && (
        <div className="flex h-full items-center justify-center px-sp-3 md:hidden">
          <span style={textStyle} className={textClass}>{mobileMessage}</span>
        </div>
      )}
    </div>
  );
}
