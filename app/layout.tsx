import type { Metadata, Viewport } from 'next';
import { Noto_Serif_JP } from 'next/font/google';

import { AnalyticsScripts } from '@/components/analytics/AnalyticsScripts';
import { PageViewTracker } from '@/components/analytics/PageViewTracker';
import { CheckoutHeader } from '@/components/layout/CheckoutHeader';
import { Footer } from '@/components/layout/Footer';
import { FooterShell } from '@/components/layout/FooterShell';
import { Header } from '@/components/layout/Header';
import { HeaderSwitcher } from '@/components/layout/HeaderSwitcher';
import { SearchOverlayProvider } from '@/components/search/SearchOverlayProvider';

import './globals.css';

// -----------------------------------------------------------------------------
// Fonts
// -----------------------------------------------------------------------------
// Primær: Satoshi (Fontshare). Ikke tilgjengelig via next/font/google — vi
// laster den via Fontshare sin CDN med `<link>`-preconnect og stylesheet i
// <head>. Fonten er regular (400) + bold (700), samme som Paper-designet.
//
// TODO (Fase 3): Last ned Satoshi-variable woff2 til public/fonts/ og koble opp
// via next/font/local for self-hosting + `display: 'swap'` uten DNS-roundtrip.
//
// Sekundær: Noto Serif JP (Google Fonts) — dekorativ font til heroer og
// branding-kopi. Self-hosted av next/font/google, latin-subset.
// -----------------------------------------------------------------------------

const notoSerifJp = Noto_Serif_JP({
  subsets: ['latin'],
  weight: ['300', '400', '700'],
  variable: '--font-noto-serif-jp',
  display: 'swap',
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Skarpekniver – Kokkekniver og slipeutstyr',
    template: '%s – Skarpekniver',
  },
  description:
    'Norsk spesialistbutikk for kokkekniver, slipeutstyr og kniv-tilbehør. Rask levering i hele Norge.',
  applicationName: 'Skarpekniver',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'nb_NO',
    siteName: 'Skarpekniver',
    url: SITE_URL,
    title: 'Skarpekniver – Kokkekniver og slipeutstyr',
    description:
      'Norsk spesialistbutikk for kokkekniver, slipeutstyr og kniv-tilbehør.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Skarpekniver',
    description: 'Kokkekniver og slipeutstyr — norsk spesialistbutikk.',
  },
  robots: {
    // Staging og preview settes til noindex via NEXT_PUBLIC_VERCEL_ENV-sjekk i middleware
    // eller egen env-flag. Se docs/seo.md > Robots & indeksering.
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // `maximumScale: 1` forhindrer iOS Safari fra å auto-zoome input-feltet når
  // bruker fokuserer på det (standard-oppførselen når font-size < 16px).
  // Alternativet — bumpe alle input-fonter til 16px — ville krevd å bryte
  // Paper-designet som bruker 15px (`text-body-md`). iOS 10+ respekterer
  // denne verdien for auto-zoom, men tillater fortsatt manuell pinch-zoom
  // (Apple overstyrer for tilgjengelighet). På Android Chrome kan dette
  // redusere pinch-zoom-kapasiteten noe, men brukere med synsbehov har
  // normalt system-level zoom (Accessibility → Magnification) som overstyrer.
  // Referanse: https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html
  maximumScale: 1,
  // Brand-farge for mobil-statuslinjen. Oppdateres når Paper-tokens er låst.
  themeColor: '#F5F5F3',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nb-NO" className={`h-full antialiased ${notoSerifJp.variable}`}>
      <head>
        {/*
         * Pre-hydrerings-tema — kjøres blocking i <head> for å sette
         * data-theme FØR første paint, så brukeren ikke ser flash fra lys
         * til mørk (eller motsatt). Leser localStorage nøkkel `skn-theme`;
         * hvis fraværende, lar vi media-query i globals.css ta over.
         */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('skn-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`,
          }}
        />
        {/* Satoshi via Fontshare — preconnect + stylesheet. Self-host i Fase 3. */}
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=satoshi@400,700&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        {/* Analytics — AnalyticsScripts mounter plattform-SDKene + registrerer
            adapterne. PageViewTracker fyrer page_view-events på SPA-route-
            endringer. ID-er leses fra NEXT_PUBLIC_*-env — hvis fraværende er
            det no-op og lokal utvikling er støyfri. */}
        <AnalyticsScripts
          ga4MeasurementId={process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID}
          metaPixelId={process.env.NEXT_PUBLIC_META_PIXEL_ID}
          tiktokPixelId={process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID}
        />
        <PageViewTracker />
        {/* SearchOverlayProvider wrapper både header og main slik at
            `SearchOverlayTrigger` kan brukes fra hvor som helst — ikke bare
            inne i headeren. Overlayet selv portal-rendres til document.body,
            så posisjonen i treet påvirker ikke layout. På /checkout vises
            ikke noen trigger, men provideren er likevel mountet (no-op). */}
        <SearchOverlayProvider>
          {/* HeaderSwitcher får både shop- og checkout-headeren pre-rendret
              som server-komponenter, og bytter mellom dem klient-side via
              usePathname. Nødvendig fordi root-layout-server-komponenter
              ikke re-renders ved client-side navigasjon mellom rutene. */}
          <HeaderSwitcher
            shop={<Header />}
            checkout={<CheckoutHeader />}
          />
          {/* `flex-1` gjør at `<main>` dytter footer ned til bunn av viewport
              selv på korte sider (f.eks. 404 eller tom søkeresultat). Footer
              har `mt-auto` som backup. Uten dette flyter footer opp midt på
              skjermen. */}
          <main className="flex-1">{children}</main>
          <FooterShell>
            <Footer />
          </FooterShell>
        </SearchOverlayProvider>
      </body>
    </html>
  );
}
