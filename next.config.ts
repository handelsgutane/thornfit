import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // React 19 med strict mode — fanger side-effekter i dev.
  reactStrictMode: true,

  // Typesafe-sjekk i `npm run build` skal feile ved TS-feil.
  // (Dette er default, men eksplisitt så vi aldri mister det.)
  typescript: {
    ignoreBuildErrors: false,
  },

  // ESLint-konfig styres via flat config (`eslint.config.mjs`) og `npm run lint`.
  // Next.js 16 har fjernet `eslint`-nøkkelen fra NextConfig.

  // -------------------------------------------------------------------
  // Bilder — Fase 1: next/image optimalisering mot WP-media direkte
  // -------------------------------------------------------------------
  // Vercel Image Optimization står foran WP-media-CDN. Første request til
  // en gitt URL henter fra `www.skarpekniver.com`, resten serveres som
  // AVIF/WebP fra Vercel edge-cache. Cache-TTL er 30 dager.
  //
  // Fase 2 (senere): Bunny pull-zone foran WP (cdn.skarpekniver.com), URL-
  // rewriting i mapper, og evt. purge-hook i webhook. Se CLAUDE.md → Åpne
  // spørsmål #5.
  //
  // Siste utvei (lang sikt): migrer media til R2 og drop WP-origin helt.
  //
  // `remotePatterns` whitelister hostene next/image får lov å laste fra.
  // Både apex og www er listet fordi Woo slipper mixed URLer.
  // -------------------------------------------------------------------
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.skarpekniver.com',
        pathname: '/wp-content/uploads/**',
      },
      {
        protocol: 'https',
        hostname: 'skarpekniver.com',
        pathname: '/wp-content/uploads/**',
      },
    ],
    // AVIF først (best komprimering), WebP fallback. JPEG/PNG for very old UA.
    formats: ['image/avif', 'image/webp'],
    // 30 dager i Vercel edge-cache. Sjeldent at et produkt-bilde endrer seg
    // innenfor et URL — nye versjoner får ny filnavn via WP.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    // Device-breakpoints som matcher Tailwind-defaults + mobil/retina.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    // Thumbnail-størrelser for grid-celler.
    imageSizes: [64, 96, 128, 256, 384],
  },

  // -------------------------------------------------------------------
  // Redirects
  // -------------------------------------------------------------------
  // 301-kart fra den eksisterende skarpekniver.no legges inn her når det
  // bygges. Se adr/0006-relaunch-with-301-map.md og docs/seo.md > Migrering.
  //
  // For stort kart (>100 entries): flytt til Vercel-level redirects eller
  // middleware for bedre cold-start-ytelse.
  // -------------------------------------------------------------------
  async redirects() {
    return [];
  },

  // -------------------------------------------------------------------
  // Headers
  // -------------------------------------------------------------------
  // Sikkerhetsheaders på alle ruter. CSP legges til når vi vet hvilke
  // tredjeparter vi trenger å whiteliste (Vipps, Stripe, analytics).
  // -------------------------------------------------------------------
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
