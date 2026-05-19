import Link from 'next/link';

export default function SlugNotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-h2 font-bold text-ink">Fant ikke siden</h1>
      <p className="mt-3 text-body text-ink-muted">
        Enten er lenken utdatert, eller så er produktet eller kategorien
        fjernet fra sortimentet.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/produkter"
          className="inline-block rounded-2 border border-divider px-4 py-2 text-body-sm text-ink hover:border-ink"
        >
          Se alle produkter
        </Link>
        <Link
          href="/kategori"
          className="inline-block rounded-2 border border-divider px-4 py-2 text-body-sm text-ink hover:border-ink"
        >
          Se alle kategorier
        </Link>
      </div>
    </main>
  );
}
