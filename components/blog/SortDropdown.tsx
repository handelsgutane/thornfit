'use client';

/**
 * SortDropdown for /kniv-info-filterbaren (Paper EF3-0).
 *
 * Layout: full-radhøyde med vertikal divider venstre, paddingLeft 20px,
 * gap 8 mellom "Sorter:" / valgt verdi / chevron. Tekst 13/16 — "Sorter:"
 * Regular haiiro (EF4-0), valgt verdi Bold kuro (EF6-0), chevron 12×12.
 *
 * Hover åpner menyen (samme mønster som produkt-katalog SortDropdown).
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

import { CaretDownIcon } from '@/components/category/filters/icons';
import { useHoverOpen } from '@/components/category/filters/useHoverOpen';
import type { PostSort } from '@/lib/supabase/blog';

interface SortOption {
  value: PostSort;
  label: string;
  /** norsk query-param-alias. Tom = default (newest). */
  param: string;
}

const OPTIONS: SortOption[] = [
  { value: 'newest', label: 'Nyeste først', param: '' },
  { value: 'oldest', label: 'Eldste først', param: 'eldste' },
  { value: 'longest', label: 'Lengste først', param: 'lengst' },
  { value: 'shortest', label: 'Korteste først', param: 'kortest' },
];

export function SortDropdown({ current }: { current: PostSort }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const { open, containerRef, containerProps, triggerProps, close } = useHoverOpen();

  const currentOption = OPTIONS.find((o) => o.value === current) ?? OPTIONS[0];

  function handleChange(next: PostSort) {
    const opt = OPTIONS.find((o) => o.value === next);
    const params = new URLSearchParams(searchParams.toString());
    if (opt && opt.param) params.set('sortering', opt.param);
    else params.delete('sortering');
    params.delete('side'); // reset paginering
    startTransition(() => {
      const qs = params.toString();
      router.push(qs ? `?${qs}` : '?');
    });
    close();
  }

  return (
    <div
      ref={containerRef}
      className="relative flex h-full items-center border-l border-divider pl-5" /* paper-exact: EF3-0 (border-left 1px sakai, padding-left 20) */
      {...containerProps}
    >
      <button
        type="button"
        {...triggerProps}
        className="flex h-full items-center gap-sp-2 transition-colors hover:text-aka focus:outline-none focus-visible:text-aka" /* paper-exact: EF3-0 (gap 8) */
        style={{ fontSize: '13px', lineHeight: '16px' }} /* paper-exact: EF4-0/EF6-0 (13/16) */
      >
        <span className="text-ink-muted" /* paper-exact: EF4-0 (Regular haiiro) */>
          Sorter:
        </span>
        <span className="font-bold text-ink" /* paper-exact: EF6-0 (Bold kuro) */>
          {currentOption.label}
        </span>
        <CaretDownIcon
          className={['transition-transform', open ? 'rotate-180' : ''].join(' ')}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 min-w-56 rounded-sm border border-divider bg-surface shadow-sm"
        >
          <ul className="flex flex-col py-sp-2">
            {OPTIONS.map((option) => {
              const isActive = option.value === current;
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => handleChange(option.value)}
                    className={[
                      'flex w-full items-center gap-sp-2 px-sp-4 py-sp-2 text-body-sm transition-colors',
                      isActive
                        ? 'font-bold text-aka'
                        : 'text-ink hover:bg-surface-muted',
                    ].join(' ')}
                  >
                    {option.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
