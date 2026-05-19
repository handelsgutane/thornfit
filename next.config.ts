import type { NextConfig } from 'next';

/**
 * Bilde-host for `next/image` avledes fra `WC_API_URL` — frontend whitelister
 * kun WordPress-instansen den faktisk synker katalogen fra. WP serverer media
 * under `/wp-content/uploads/` på samme host som REST-API-et. Verdien leses
 * ved build-tid (`next.config.ts` kjører i Node før bundling); Vercel injiserer
 * env-varene da, og lokalt kommer den fra `.env.local`.
 *
 * Returnerer `null` hvis `WC_API_URL` mangler/er ugyldig — da blir
 * `remotePatterns` tom og `next/image` avviser alt. I praksis feiler bygget
 * uansett tidligere i `lib/env.ts` hvis variabelen mangler.
 */
function wooImagePattern() {
  const raw = process.env.WC_API_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return {
      protocol: url.protocol.replace(':', '') as 'http' | 'https',
      hostname: url.hostname,
      pathname: '/wp-content/uploads/**',
    };
  } catch {
    return null;
  }
}

const wooImage = wooImagePattern();

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
  // Bilder — next/image optimalisering mot WP-media direkte
  // -------------------------------------------------------------------
  // Vercel Image Optimization står foran WP. Første request til en gitt URL
  // henter fra WP-origin, resten serveres som AVIF/WebP fra Vercel edge-cache
  // (30 dagers TTL).
  //
  // `remotePatterns` whitelister hosten next/image får laste fra. Den avledes
  // fra WC_API_URL via `wooImagePattern()` — se kommentaren der. Dette holder
  // konfigen riktig uansett hvilken WP-instans miljøet peker på.
  //
  // Fase 2 (senere): Bunny pull-zone / R2 foran WP — da må mønsteret utvides.
  // Se CLAUDE.md → Åpne spørsmål #5/#6.
  // -------------------------------------------------------------------
  images: {
    remotePatterns: wooImage ? [wooImage] : [],
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
