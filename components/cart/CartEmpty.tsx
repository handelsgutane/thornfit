/**
 * CartEmpty — vises når `items.length === 0`.
 *
 * Paper har ingen eksplisitt empty-state i 4V6-0/65X-0 (den antar alltid 3
 * varer), så vi bygger en enkel editorial-state med primary-CTA tilbake til
 * katalog. Ikke "Fortsett å handle" — den impliserer at man ER i kjøpsflyt.
 */

import { Button } from '@/components/ui/Button';

export function CartEmpty() {
  return (
    <div
      className="mx-auto mt-16 flex max-w-(--width-empty-state) flex-col items-center gap-6 border border-divider bg-surface p-sp-8 text-center"
      role="status"
    >
      <h1 className="text-h2 font-bold text-ink">Handlekurven din er tom</h1>
      <p className="text-body text-ink-muted">
        Bla gjennom kniver, sliperedskap og tilbehør — legg noe i kurven når du
        er klar.
      </p>
      <Button
        href="/produkter"
        variant="primary"
        size="lg"
        className="mt-2 min-w-(--width-cta-min)"
      >
        Se alle produkter
      </Button>
    </div>
  );
}
