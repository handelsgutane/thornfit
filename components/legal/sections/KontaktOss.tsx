/**
 * Kontakt oss (seksjon 06) — Paper 7GH-0.
 *
 * Kort intro + to info-kort side om side (Skarpe Kniver AS + Datatilsynet).
 * På desktop er kortene `flex-1` i en `gap-sp-3`-rad. På compact (mobil)
 * stacker de vertikalt siden 2×kort ikke er lesbart på 358px.
 */

import type { Density } from './types';

export function KontaktOss({ density }: { density: Density }) {
  const isFull = density === 'full';
  const stackClasses = isFull
    ? 'flex gap-sp-3'
    : 'flex flex-col gap-sp-3';

  return (
    <div className="flex flex-col gap-sp-4">
      <p className="text-body leading-relaxed text-ink">
        Har du spørsmål om dine rettigheter, en ordre, eller ønsker å utøve dine
        personvernrettigheter? Ta gjerne kontakt — vi svarer innen én virkedag.
      </p>

      <div className={stackClasses}>
        <article className="flex flex-1 flex-col gap-sp-3 rounded-1 border border-divider bg-surface px-sp-4 py-sp-4">
          <h4 className="text-body-xs font-bold uppercase tracking-wider text-ink">
            Skarpe Kniver AS
          </h4>
          <div className="flex flex-col gap-sp-1">
            <p className="text-body-sm text-ink-muted">
              Storgata 12, 0182 Oslo
            </p>
            <p className="text-body-sm text-ink-muted">Org.nr. 912 345 678</p>
            <a
              href="mailto:post@thornfit.no"
              className="text-body-sm text-ink transition-colors hover:text-aka focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-1"
            >
              post@thornfit.no
            </a>
            <a
              href="tel:+4722000000"
              className="text-body-sm text-ink transition-colors hover:text-aka focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-1"
            >
              +47 22 00 00 00
            </a>
          </div>
        </article>

        <article className="flex flex-1 flex-col gap-sp-3 rounded-1 border border-divider bg-surface px-sp-4 py-sp-4">
          <h4 className="text-body-xs font-bold uppercase tracking-wider text-ink">
            Datatilsynet
          </h4>
          <div className="flex flex-col gap-sp-1">
            <p className="text-body-sm leading-relaxed text-ink-muted">
              Mener du at vi behandler personopplysningene dine i strid med
              regelverket, kan du klage til Datatilsynet.
            </p>
            <a
              href="https://www.datatilsynet.no"
              target="_blank"
              rel="noreferrer"
              className="text-body-sm text-ink transition-colors hover:text-aka focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-1"
            >
              www.datatilsynet.no
            </a>
          </div>
        </article>
      </div>
    </div>
  );
}
