'use client';

/**
 * AnalyticsScripts — laster plattformenes SDKer og registrerer adapterne
 * mot `lib/analytics/emitter`. Plassert i `app/layout.tsx` slik at den
 * mounter én gang og overlever route-endringer.
 *
 * Designvalg:
 *   - Scripts lastes med `next/script` + `strategy="afterInteractive"` for
 *     GA4 og `lazyOnload` for pixlene. Vi vil ikke blokkere LCP på
 *     Meta/TikTok. GA4 er litt høyere prioritet fordi pageview-data driver
 *     attribusjonsmodellen.
 *   - Ingen pixel-script lastes før consent. `AnalyticsScripts` lytter på
 *     `onConsentChange` og bumper `marketingEnabled` når brukeren gir grant.
 *     Da renderer vi pixel-scriptene (neste commit/render). Før det er
 *     adapterne registrert men `isAvailable()` returnerer false.
 *   - ID-gate: hvis en plattforms public ID mangler, rendrer vi ikke
 *     scriptet og registrerer ikke adapteren. Gjør lokal dev støyfri.
 *
 * Consent Mode v2: vi setter default "denied" for GA4 før script-loading
 * via en inline `gtag('consent', 'default', ...)`-snippet så Googles
 * consent-mode modellerer konverteringer korrekt.
 *
 * Viktig: `window.gtag`/`fbq`/`ttq`-stubber defineres før async-script-
 * tagens onLoad. Dette sikrer at emitteren kan registrere adapterne
 * umiddelbart — de queuer calls til det ekte scriptet er lastet.
 */

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

import { registerAdapter, unregisterAdapter } from '@/lib/analytics/emitter';
import { createGa4Adapter } from '@/lib/analytics/adapters/ga4';
import { createMetaAdapter } from '@/lib/analytics/adapters/meta';
import { createTikTokAdapter } from '@/lib/analytics/adapters/tiktok';
import { getConsent, onConsentChange } from '@/lib/analytics/consent';

export interface AnalyticsScriptsProps {
  /** GA4 Measurement ID — `G-XXXXXXXXXX`. Tomt = ikke lastet. */
  ga4MeasurementId?: string;
  /** Meta Pixel ID — numerisk streng. Tomt = ikke lastet. */
  metaPixelId?: string;
  /** TikTok Pixel ID (Pixel Code) — string. Tomt = ikke lastet. */
  tiktokPixelId?: string;
}

export function AnalyticsScripts({
  ga4MeasurementId,
  metaPixelId,
  tiktokPixelId,
}: AnalyticsScriptsProps) {
  const [marketingConsent, setMarketingConsent] = useState(
    () => getConsent().marketing,
  );
  const [analyticsConsent, setAnalyticsConsent] = useState(
    () => getConsent().analytics,
  );
  const registeredRef = useRef<{ ga4?: boolean; meta?: boolean; tiktok?: boolean }>({});

  // Lytt på consent — re-render når brukeren gir/trekker samtykke.
  useEffect(() => {
    const unsub = onConsentChange((c) => {
      setAnalyticsConsent(c.analytics);
      setMarketingConsent(c.marketing);
    });
    return () => unsub();
  }, []);

  // Registrer adapterne idempotent. Emitteren får adapter-instansen, men den
  // fyrer først når `isAvailable()` er true (som avhenger av at script-taggen
  // har lastet window.gtag/fbq/ttq).
  useEffect(() => {
    if (ga4MeasurementId && !registeredRef.current.ga4) {
      registerAdapter(createGa4Adapter({ measurementId: ga4MeasurementId }));
      registeredRef.current.ga4 = true;
    }
    if (metaPixelId && !registeredRef.current.meta) {
      registerAdapter(createMetaAdapter({ pixelId: metaPixelId }));
      registeredRef.current.meta = true;
    }
    if (tiktokPixelId && !registeredRef.current.tiktok) {
      registerAdapter(createTikTokAdapter({ pixelId: tiktokPixelId }));
      registeredRef.current.tiktok = true;
    }
    return () => {
      // Normalt unmounter layout aldri, men ryddig cleanup i dev / fast refresh.
      unregisterAdapter('ga4');
      unregisterAdapter('meta');
      unregisterAdapter('tiktok');
      registeredRef.current = {};
    };
  }, [ga4MeasurementId, metaPixelId, tiktokPixelId]);

  return (
    <>
      {/* GA4 — Consent Mode v2 default deny. Google tillater at scriptet
          lastes uten consent så lenge det startes i denied-state; modellerte
          konverteringer genereres deretter.

          Vi bruker en ren inline <script>-tag (ikke next/script med
          strategy="beforeInteractive") fordi `beforeInteractive` i App Router
          bare er støttet i root-layout og utløser ESLint-advarsel uansett.
          En inline-tag her kjører synkront før React-hydration, som er
          akkurat timing-garantien Consent Mode trenger. */}
      {ga4MeasurementId && (
        <>
          <script
            dangerouslySetInnerHTML={{
              __html: `
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                window.gtag = gtag;
                gtag('consent', 'default', {
                  ad_storage: 'denied',
                  ad_user_data: 'denied',
                  ad_personalization: 'denied',
                  analytics_storage: 'denied',
                  wait_for_update: 500
                });
                gtag('js', new Date());
                gtag('config', '${ga4MeasurementId}', { send_page_view: false });
              `,
            }}
          />
          <Script
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4MeasurementId)}`}
          />
          {/* Når samtykke endres, signaliser til Googles consent-mode. */}
          <Script id="ga4-consent-update" strategy="afterInteractive">
            {`
              (function(){
                function push(c){
                  if (!window.gtag) return;
                  window.gtag('consent','update',{
                    analytics_storage: c.analytics ? 'granted' : 'denied',
                    ad_storage: c.marketing ? 'granted' : 'denied',
                    ad_user_data: c.marketing ? 'granted' : 'denied',
                    ad_personalization: c.marketing ? 'granted' : 'denied'
                  });
                }
                push({ analytics: ${analyticsConsent}, marketing: ${marketingConsent} });
              })();
            `}
          </Script>
        </>
      )}

      {/* Meta Pixel — lastes kun ved marketing consent. */}
      {metaPixelId && marketingConsent && (
        <Script id="meta-pixel" strategy="lazyOnload">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${metaPixelId}');
          `}
        </Script>
      )}

      {/* TikTok Pixel — lastes kun ved marketing consent. */}
      {tiktokPixelId && marketingConsent && (
        <Script id="tiktok-pixel" strategy="lazyOnload">
          {`
            !function (w, d, t) {
              w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
              ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];
              ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
              for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
              ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
              ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var i=document.createElement("script");i.type="text/javascript",i.async=!0,i.src=r+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(i,a)};
              ttq.load('${tiktokPixelId}');
              ttq.page();
            }(window, document, 'ttq');
          `}
        </Script>
      )}
    </>
  );
}
