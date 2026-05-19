'use client';

/**
 * "Last flere artikler"-knapp. Setter `?side=N+1` i URL'en. Server-component
 * leser side-paramet og henter limit = PAGE_SIZE * N. Vi går ikke for
 * client-side appending fordi URL-basert paginering er bedre for SEO og
 * deep-linking.
 *
 * Mobil (Paper FYZ-0 G2L-0): full-bredde 1.5px ink button, padding 14/20.
 * Desktop (Paper EFK-0): w 220, h 52, border 2px kuro, radius 2.
 */

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import type { PostSort } from '@/lib/supabase/blog';

export function LoadMoreButton({
  nextPage,
  currentSort,
  label,
}: {
  nextPage: number;
  currentSort: PostSort;
  label: string;
}) {
  void currentSort;
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());
  params.set('side', String(nextPage));

  return (
    <Link
      href={`?${params.toString()}`}
      scroll={false}
      className="flex w-full items-center justify-center rounded-1 border-[1.5px] border-ink bg-canvas px-sp-5 py-3.5 text-body-sm font-bold text-ink transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2 lg:h-13 lg:w-[220px] lg:border-2 lg:py-0" /* paper-exact: FYZ-0 G2L-0 (mobile 1.5px) + EFK-0 (desktop 220×52, border 2px kuro) */
      style={{ fontSize: '14px', lineHeight: '18px' }} /* paper-exact: EFL-0 (14/18 Bold) */
    >
      {label}
    </Link>
  );
}
