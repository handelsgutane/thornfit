/**
 * Loading-state for /tilbud — speiler det endelige seksjonerte mønsteret:
 *   1. Svart editorial-band
 *   2. Kategori-chip-rad
 *   3. To seksjon-skelett (header + grid)
 */

export default function TilbudLoading() {
  return (
    <main className="w-full">
      {/* Svart editorial-band — matcher CategoryHeaderDefault */}
      <section className="w-full bg-kuro px-sp-4 pt-[40px] pb-[36px] sm:flex sm:items-end sm:justify-between sm:gap-sp-6 sm:px-sp-7">
        <div className="flex max-w-3xl flex-col gap-sp-2">
          <div className="h-3 w-12 animate-pulse rounded bg-haiiro/30" />
          <div className="h-12 w-32 animate-pulse rounded bg-haiiro/30" />
          <div className="h-5 w-3/4 max-w-md animate-pulse rounded bg-haiiro/30" />
        </div>
        <div className="mt-sp-4 h-3 w-24 animate-pulse rounded bg-haiiro/30 sm:mt-0" />
      </section>

      {/* Chip-rad skeleton */}
      <div className="border-b border-divider bg-surface px-sp-2 py-sp-3 sm:px-sp-7">
        <div className="flex flex-wrap gap-sp-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-7 w-32 animate-pulse rounded-full bg-surface-muted"
            />
          ))}
        </div>
      </div>

      {/* To seksjon-skelett */}
      <div className="px-sp-3 sm:px-sp-7">
        {Array.from({ length: 2 }).map((_, sectionIdx) => (
          <section
            key={sectionIdx}
            className="border-b border-divider py-sp-7 last:border-b-0"
          >
            <div className="mb-sp-5 flex items-baseline justify-between">
              <div className="h-7 w-48 animate-pulse rounded bg-surface-muted" />
              <div className="h-3 w-20 animate-pulse rounded bg-surface-muted" />
            </div>
            <div className="grid grid-cols-2 gap-sp-3 sm:grid-cols-3 sm:gap-sp-4 md:grid-cols-4 lg:grid-cols-5 lg:gap-sp-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-sp-2">
                  <div className="aspect-square w-full animate-pulse rounded bg-surface-muted" />
                  <div className="h-4 w-3/4 animate-pulse rounded bg-surface-muted" />
                  <div className="h-4 w-1/2 animate-pulse rounded bg-surface-muted" />
                  <div className="h-5 w-1/3 animate-pulse rounded bg-surface-muted" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
