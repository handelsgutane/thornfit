'use client';

import Image from 'next/image';
import { useState, useRef } from 'react';

export interface ProductImage {
  src: string;
  alt: string;
}

interface ProductGalleryProps {
  images: ProductImage[];
  productName: string;
}

export function ProductGallery({ images, productName }: ProductGalleryProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const count = images.length;

  const prev = () => setActiveIdx((i) => (i - 1 + count) % count);
  const next = () => setActiveIdx((i) => (i + 1) % count);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    if (Math.abs(dx) > 40) dx < 0 ? next() : prev();
    touchStartX.current = null;
  };

  const active = images[activeIdx];

  return (
    <div className="flex flex-col gap-sp-2">
      {/* Hovedbilde med swipe + pil-knapper */}
      <div
        className="group relative w-full overflow-hidden rounded-1 bg-surface-muted"
        style={{ aspectRatio: '620 / 580' }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {active ? (
          <Image
            src={active.src}
            alt={active.alt || productName}
            fill
            priority
            sizes="100vw"
            className="object-cover select-none"
            draggable={false}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-surface-muted">
            <span
              className="font-serif font-light text-[80px] leading-none text-ink-muted/20"
              style={{ fontFamily: '"Noto Serif JP", serif' }}
              aria-hidden
            >
              包丁
            </span>
          </div>
        )}

        {/* Pil-knapper — vises ved hover og touch-enheter */}
        {count > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="Forrige bilde"
              className="absolute left-2 top-1/2 -translate-y-1/2 flex size-8 items-center justify-center rounded-1 bg-surface/80 text-ink shadow-sm backdrop-blur-sm transition-opacity opacity-0 group-hover:opacity-100 active:opacity-100"
            >
              <ChevronLeftIcon />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Neste bilde"
              className="absolute right-2 top-1/2 -translate-y-1/2 flex size-8 items-center justify-center rounded-1 bg-surface/80 text-ink shadow-sm backdrop-blur-sm transition-opacity opacity-0 group-hover:opacity-100 active:opacity-100"
            >
              <ChevronRightIcon />
            </button>

            {/* Dot-indikator */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
              {images.slice(0, 6).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveIdx(i)}
                  aria-label={`Bilde ${i + 1}`}
                  className={[
                    'size-1.5 rounded-full transition-all',
                    i === activeIdx ? 'bg-white w-3' : 'bg-white/50',
                  ].join(' ')}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Thumbnail-strip */}
      {count > 1 && (
        <ul className="grid grid-cols-4 gap-2">
          {images.slice(0, 4).map((img, idx) => (
            <li key={idx}>
              <button
                type="button"
                onClick={() => setActiveIdx(idx)}
                className={[
                  'relative w-full overflow-hidden rounded-1 bg-surface-muted transition-opacity',
                  idx === activeIdx
                    ? 'ring-1 ring-ink ring-offset-1 opacity-100'
                    : 'opacity-60 hover:opacity-100',
                ].join(' ')}
                style={{ aspectRatio: '1 / 1' }}
                aria-label={img.alt || `Bilde ${idx + 1}`}
                aria-current={idx === activeIdx}
              >
                <Image
                  src={img.src}
                  alt={img.alt || `${productName} bilde ${idx + 1}`}
                  fill
                  sizes="15vw"
                  className="object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Ingen bilder */}
      {count === 0 && (
        <ul className="grid grid-cols-4 gap-2">
          {['Profil', 'Egg', 'Håndtak', 'Pakket'].map((label) => (
            <li key={label}>
              <div
                className="relative w-full overflow-hidden rounded-1 bg-surface-muted"
                style={{ aspectRatio: '1 / 1' }}
              >
                <div className="flex h-full flex-col items-center justify-end pb-2">
                  <span className="text-label font-bold uppercase text-ink-muted">{label}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M5 2L10 7L5 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
