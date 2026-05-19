/**
 * Loading-state for /sok. Speiler det endelige mønsteret:
 *   1. Svart editorial-band (samme som CategoryHeaderDefault)
 *   2. Chip-rad (sticky-stripe) skeleton
 *   3. Grid skeleton med samme padding som ProductGrid
 *
 * Dimensjoner aligner med ProductCard for å unngå CLS når ekte data lander.
 */

export default function SearchLoading() {
  return (
    <main className="w-full">
      {/* Svart editorial-band — matcher SearchHeaderDefault */}
      <section className="w-full bg-kuro px-sp-4 pt-[40px] pb-[36px] sm:flex sm:items-end sm:justify-between sm:gap-sp-6 sm:px-sp-7">
        <div className="flex max-w-3xl flex-col gap-sp-2">
          <div className="h-3 w-12 animate-pulse rounded bg-haiiro/30" />
          <div className="h-12 w-2/3 max-w-md animate-pulse rounded bg-haiiro/30" />
          <div className="h-5 w-3/4 max-w-sm animate-pulse rounded bg-haiiro/30" />
        </div>
      </section>

      {/* Chip-rad skeleton */}
      <div className="border-b border-divider bg-surface px-sp-2 py-sp-3 sm:px-sp-7">
        <div className="flex flex-wrap gap-sp-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-7 w-24 animate-pulse rounded-full bg-surface-muted"
            />
          ))}
        </div>
      </div>

      {/* Grid skeleton — samme padding-wrapper som ProductGrid bruker. */}
      <div className="px-sp-2 py-sp-3 sm:px-sp-7 sm:py-sp-7">
        <div className="grid grid-cols-2 gap-sp-3 sm:grid-cols-3 sm:gap-sp-4 md:grid-cols-4 lg:grid-cols-5 lg:gap-sp-6">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-sp-2">
              <div className="aspect-square w-full animate-pulse rounded bg-surface-muted" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-surface-muted" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-surface-muted" />
              <div className="h-5 w-1/3 animate-pulse rounded bg-surface-muted" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
