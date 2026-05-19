'use client';

/**
 * ProductGalleryDesktop — 2-kol bildegrid med hover-zoom og lightbox.
 *
 * Hover: zoom-knapp øverst i høyre hjørne på hvert bilde.
 * Klikk: lightbox åpnes med bildet sentrert i galleriet.
 */

import { useState, useEffect, useCallback } from 'react';

import type { ProductImage } from './ProductGallery';

interface ProductGalleryDesktopProps {
  images: ProductImage[];
  productName: string;
}

const PLACEHOLDERS = [
  'linear-gradient(160deg,#2a2018 0%,#1a1008 60%,#352210 100%)',
  'linear-gradient(160deg,#1c1408 0%,#2d1e0a 50%,#160e05 100%)',
  'linear-gradient(160deg,#352a1a 0%,#1a120a 60%,#281c0e 100%)',
  'linear-gradient(160deg,#0e0a06 0%,#1e1408 60%,#2a1e10 100%)',
];

export function ProductGalleryDesktop({ images, productName }: ProductGalleryDesktopProps) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const close = useCallback(() => setLightboxIdx(null), []);

  useEffect(() => {
    if (lightboxIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIdx, close]);

  useEffect(() => {
    if (lightboxIdx === null || images.length <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setLightboxIdx((i) => (i === null ? 0 : (i + 1) % images.length));
      if (e.key === 'ArrowLeft') setLightboxIdx((i) => (i === null ? 0 : (i - 1 + images.length) % images.length));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIdx, images.length]);

  const hasImages = images.length > 0;

  return (
    <>
      <div className="grid grid-cols-2">
        {hasImages
          ? images.map((img, idx) => (
              <div
                key={idx}
                className="group relative overflow-hidden"
                style={{ aspectRatio: '4 / 5' }}
              >
                <img
                  src={img.src}
                  alt={img.alt || `${productName} — bilde ${idx + 1}`}
                  className="h-full w-full object-cover"
                  loading={idx === 0 ? 'eager' : 'lazy'}
                />
                <button
                  type="button"
                  onClick={() => setLightboxIdx(idx)}
                  aria-label={`Forstørr bilde ${idx + 1}`}
                  className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-1 bg-surface/90 text-ink opacity-0 shadow-sm backdrop-blur-sm transition-opacity hover:bg-surface group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aka"
                >
                  <ZoomIcon />
                </button>
              </div>
            ))
          : PLACEHOLDERS.map((bg, idx) => (
              <div
                key={idx}
                className="flex items-center justify-center"
                style={{ aspectRatio: '4 / 5', background: bg }}
              >
                <span
                  className="font-serif font-light text-white/10"
                  style={{ fontFamily: '"Noto Serif JP", serif', fontSize: '120px' }}
                  aria-hidden
                >
                  包丁
                </span>
              </div>
            ))}
      </div>

      {lightboxIdx !== null && images[lightboxIdx] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-kuro/80 backdrop-blur-sm"
          onClick={close}
          role="dialog"
          aria-modal
          aria-label="Bildeforstørrer"
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={images[lightboxIdx].src}
              alt={images[lightboxIdx].alt || `${productName} — bilde ${lightboxIdx + 1}`}
              className="max-h-[90vh] max-w-[90vw] object-contain"
              style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}
            />

            <button
              type="button"
              onClick={close}
              aria-label="Lukk"
              className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-1 bg-surface/90 text-ink shadow-sm backdrop-blur-sm hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aka"
            >
              <CloseIcon />
            </button>

            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setLightboxIdx((i) => (i === null ? 0 : (i - 1 + images.length) % images.length))}
                  aria-label="Forrige bilde"
                  className="absolute left-3 top-1/2 -translate-y-1/2 flex size-9 items-center justify-center rounded-1 bg-surface/90 text-ink shadow-sm backdrop-blur-sm hover:bg-surface"
                >
                  <ChevronLeftIcon />
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxIdx((i) => (i === null ? 0 : (i + 1) % images.length))}
                  aria-label="Neste bilde"
                  className="absolute right-3 top-1/2 -translate-y-1/2 flex size-9 items-center justify-center rounded-1 bg-surface/90 text-ink shadow-sm backdrop-blur-sm hover:bg-surface"
                >
                  <ChevronRightIcon />
                </button>
              </>
            )}

            <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-1 bg-kuro/60 px-3 py-1 text-label font-bold text-white">
              {lightboxIdx + 1} / {images.length}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function ZoomIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 10L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M4.5 6.5H8.5M6.5 4.5V8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
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
