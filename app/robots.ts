import type { MetadataRoute } from 'next';

/**
 * Genererer /robots.txt.
 *
 * Regler følger docs/seo.md > Robots & indeksering:
 * - Disallow på brukerspesifikke og tekniske ruter
 * - Disallow på alle Vercel-miljøer som ikke er produksjon (preview + staging
 *   skal aldri indekseres av søkemotorer, selv om de er offentlig tilgjengelige)
 * - Sitemap-peker til samme host
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default function robots(): MetadataRoute.Robots {
  // Produksjon = live skarpekniver.no. Alt annet (preview, staging, dev) skal
  // blokkeres for søkemotorer — vi vil ikke at preview-URL-er skal dukke opp
  // i Google.
  const isProduction = process.env.VERCEL_ENV === 'production';

  if (!isProduction) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
      host: SITE_URL,
    };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/handlekurv',
          '/kasse',
          '/kasse/',
          '/konto/',
          '/sok',
          // Woo kan vise sine egne query-params — redirigeres men vi bekrefter
          // at de ikke indekseres samtidig.
          '/*?add-to-cart=*',
          '/*?orderby=*',
          '/*?filter_*',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
