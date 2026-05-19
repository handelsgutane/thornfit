'use client';

import { Toast, useToast } from '@/components/ui/Toast';
import { useWishlistStore } from '@/lib/wishlist/store';
import type { WishlistItem } from '@/types/wishlist';

interface WishlistButtonProps {
  item: WishlistItem;
  /**
   * sm (default): h-12 w-12 border-1px — for kortvisning
   * lg: h-14 w-14 border-2px solid ink — Paper EA7-1, brukt i AddToCartButton default-state
   */
  size?: 'sm' | 'lg';
}

export function WishlistButton({ item, size = 'sm' }: WishlistButtonProps) {
  const addItem = useWishlistStore((s) => s.addItem);
  const removeItem = useWishlistStore((s) => s.removeItem);
  const inWishlist = useWishlistStore((s) => s.hasItem(item.id));
  const { toastProps, showToast } = useToast();

  function toggle() {
    if (inWishlist) {
      removeItem(item.id);
      showToast({ variant: 'info', message: 'Fjernet fra ønskelisten' });
    } else {
      addItem({ ...item, addedAt: new Date().toISOString() });
      showToast({
        variant: 'success',
        message: 'Lagret til ønskelisten',
        action: { label: 'Se ønskeliste →', href: '/konto/onskeliste' },
      });
    }
  }

  const isLg = size === 'lg';

  return (
    <>
    <button
      type="button"
      onClick={toggle}
      aria-label={inWishlist ? 'Fjern fra ønskeliste' : 'Legg til ønskeliste'}
      title={inWishlist ? 'Fjern fra ønskeliste' : 'Legg til ønskeliste'}
      className={[
        'flex shrink-0 items-center justify-center rounded-1 transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2',
        isLg
          // Paper EA7-1: 56×56, border-2px solid ink (#1A1A1A)
          ? 'h-14 w-14 border-2 border-ink hover:bg-surface-hover'
          : 'h-12 w-12 border border-divider hover:border-ink hover:bg-surface-hover',
        inWishlist ? 'border-aka' : '',
      ].join(' ')}
    >
      <svg
        width={isLg ? 18 : 16}
        height={isLg ? 18 : 16}
        viewBox="0 0 16 16"
        fill={inWishlist ? 'currentColor' : 'none'}
        aria-hidden
        className={inWishlist ? 'text-aka' : 'text-ink'}
      >
        <path
          d="M8 13.5C8 13.5 2 9.5 2 5.5C2 3.567 3.567 2 5.5 2C6.613 2 7.607 2.52 8 3.5C8.393 2.52 9.387 2 10.5 2C12.433 2 14 3.567 14 5.5C14 9.5 8 13.5 8 13.5Z"
          stroke="currentColor"
          strokeWidth="1.25"
        />
      </svg>
    </button>
    {toastProps && <Toast {...toastProps} />}
    </>
  );
}
