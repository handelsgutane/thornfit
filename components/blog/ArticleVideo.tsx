'use client';

/**
 * ArticleVideo — pinned video-sidebar (desktop) / inline (mobile).
 *
 * Viser en TikTok/YouTube-stil 9:16 player som:
 *   - er sticky på desktop (følger med ved scroll)
 *   - er full-bleed under header på mobil
 *
 * MVP-implementering: thumbnail-card med play-overlay som linker ut til
 * YouTube. Når vi vil ha embed på siden, byttes klikk-håndtering til å
 * åpne en lightbox med iframe.
 *
 * Ekstrakter YouTube-video-ID fra URL hvis mulig — brukes til å vise
 * `i.ytimg.com`-thumbnail uten å bruke ekstra API-kall.
 */

import { useState } from 'react';

interface ArticleVideoProps {
  videoUrl: string;
  /** Vises i player-headeren (TikTok-stil). */
  caption?: string;
}

function extractYouTubeId(url: string): string | null {
  // Støtter: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID, youtube.com/shorts/ID
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

export function ArticleVideo({
  videoUrl,
  caption,
}: ArticleVideoProps) {
  const [playing, setPlaying] = useState(false);
  const ytId = extractYouTubeId(videoUrl);
  const thumbnailUrl = ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : null;

  return (
    <div className="flex flex-col gap-sp-2">
      {/* Player — mobil er full-bleed (ingen rounded corners), desktop har
          rounded-1 fordi den lever inne i en sticky sidebar. */}
      <div
        className="relative w-full overflow-hidden bg-kuro lg:rounded-1"
        style={{ aspectRatio: '9 / 16' }}
      >
        {playing && ytId ? (
          // Lazy iframe-embed — først etter klikk så vi ikke laster YouTube-
          // tracking på alle artikkel-sider by default.
          <iframe
            src={`https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`}
            title={caption ?? 'Video'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label="Spill av video"
            className="group relative h-full w-full"
          >
            {thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbnailUrl}
                alt={caption ?? 'Video-thumbnail'}
                className="absolute inset-0 h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100"
              />
            )}

            {/* Header — brand-tag (progress-bar fjernet etter design-iterasjon). */}
            <div className="absolute inset-x-0 top-0 flex items-center gap-sp-2 px-3.5 pt-3.5">
              <span className="flex size-7 items-center justify-center rounded-full border-[1.5px] border-white bg-aka text-shiro text-[10px] font-bold" /* paper-exact: EZ7-0 F01-0 (32px brand avatar with 1.5px white border, 10px init) */>
                SK
              </span>
              <span className="text-body-xs font-bold text-shiro">skarpekniver</span>
              <span className="text-body-xs text-shiro/70">· Følg</span>
              <span className="ml-auto text-shiro" aria-hidden>
                ⋯
              </span>
            </div>

            {/* Play-knapp center */}
            <span className="absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[1.5px] border-white/40 bg-white/15 backdrop-blur-sm" /* paper-exact: EZ7-0 F0F-0 (64px play-knapp med 1.5px hvit border) */>
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
                <path d="M7 4L16 10L7 16V4Z" fill="#fff" />
              </svg>
            </span>

            {/* Caption + bottom-right time-stamp */}
            {caption && (
              <div
                className="absolute inset-x-0 bottom-0 px-3.5 pb-3.5 pt-10"
                style={{
                  backgroundImage:
                    'linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0))',
                }}
              >
                <p className="text-body-sm font-medium text-shiro line-clamp-2">
                  {caption}
                </p>
              </div>
            )}
          </button>
        )}
      </div>

      {/* "Se på YouTube"-link — kun desktop */}
      <a
        href={videoUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="hidden items-center gap-sp-2 text-body-sm text-ink hover:text-aka md:flex"
      >
        <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden>
          <rect width="16" height="12" rx="2" fill="#FF0000" />
          <path d="M6.5 3.5L11 6L6.5 8.5V3.5Z" fill="#fff" />
        </svg>
        Se på YouTube <span aria-hidden>→</span>
      </a>
    </div>
  );
}
