/**
 * Analytics event vocabulary — den interne, plattform-agnostiske kontrakten.
 *
 * Se ADR-0010 for hvorfor vi ikke kaller `gtag/fbq/ttq` direkte i komponenter.
 * Kort versjon: én typet union = én kontrakt, adaptere oversetter til
 * plattform-dialekter. Legger du til et event her, må du oppdatere alle
 * adapterne (typene tvinger det).
 *
 * Konvensjon:
 *   - Event-navn er snake_case (matcher GA4 anbefalinger — adaptere mapper
 *     om til Meta `AddToCart`/TikTok `AddToCart` der casing avviker).
 *   - Alle monetære verdier er i NOK (ADR-0005, ett marked). Ingen
 *     `currency`-felt i payload — adaptere fyller konstant `"NOK"`.
 *   - `item`/`items` bruker `AnalyticsItem`-shapen som er et kompromiss
 *     mellom GA4 (`items[]`) og Meta/TikTok (`content_ids[]` +
 *     `contents[]`) — adaptere plukker ut det de trenger.
 */

/**
 * En flat, minimal produkt-representasjon som holder det alle tre
 * plattformer trenger. Bygges fra `CatalogListItem`, `Product` eller
 * `CartItem` via `toAnalyticsItem()`-helpere i kall-stedene.
 */
export interface AnalyticsItem {
  /** Stabil ID — bruker Supabase `products.id` (samme som Woo-ID). */
  id: string;
  /** SKU brukes av Meta som primær content_id når tilgjengelig. */
  sku?: string | null;
  name: string;
  /** Enhetspris i NOK (etter evt. sale). */
  price: number;
  quantity?: number;
  /** Primær-kategori slug — GA4 `item_category`. */
  category?: string | null;
  /** Brand/merke — GA4 `item_brand`, Meta `brand`. */
  brand?: string | null;
}

/**
 * Discriminated union av alle events som kan fyres. Hver variant har sin
 * egen payload-type — TS fanger feil payload form i compile-time.
 *
 * Når du legger til et event:
 *   1. Legg til variant her
 *   2. Kjør tsc — alle adaptere får feilmelding
 *   3. Implementer mapping i hver adapter (`ga4.ts`, `meta.ts`, `tiktok.ts`)
 *   4. Eventuelt legg til CAPI-mapping i `server/capi.ts`
 */
export type AnalyticsEvent =
  | {
      name: 'page_view';
      payload: {
        path: string;
        title?: string;
        referrer?: string;
      };
    }
  | {
      name: 'view_item';
      payload: {
        item: AnalyticsItem;
      };
    }
  | {
      name: 'view_item_list';
      payload: {
        /** Listens ID/kontekst: 'category:bryner', 'search', 'related', 'wishlist'. */
        listId: string;
        /** Menneskelig listenavn til GA4 `item_list_name` (valgfri). */
        listName?: string;
        items: AnalyticsItem[];
      };
    }
  | {
      name: 'select_item';
      payload: {
        item: AnalyticsItem;
        /** Listen den ble klikket fra: 'category:bryner', 'search', 'related'. */
        listId?: string;
        position?: number;
      };
    }
  | {
      name: 'add_to_cart';
      payload: {
        item: AnalyticsItem;
        quantity: number;
      };
    }
  | {
      name: 'remove_from_cart';
      payload: {
        item: AnalyticsItem;
        quantity: number;
      };
    }
  | {
      name: 'add_to_wishlist';
      payload: {
        item: AnalyticsItem;
      };
    }
  | {
      name: 'view_cart';
      payload: {
        items: AnalyticsItem[];
        value: number;
      };
    }
  | {
      name: 'begin_checkout';
      payload: {
        items: AnalyticsItem[];
        value: number;
        /** Applied coupon codes hvis brukeren har skrevet inn noen. */
        coupon?: string;
      };
    }
  | {
      name: 'add_payment_info';
      payload: {
        items: AnalyticsItem[];
        value: number;
        paymentMethod: 'vipps' | 'stripe';
      };
    }
  | {
      name: 'purchase';
      payload: {
        orderId: string;
        items: AnalyticsItem[];
        value: number;
        tax?: number;
        shipping?: number;
        coupon?: string;
      };
    }
  | {
      name: 'search';
      payload: {
        query: string;
        resultsCount?: number;
      };
    }
  | {
      name: 'login';
      payload: {
        method: 'vipps' | 'email' | 'sso';
      };
    }
  | {
      name: 'sign_up';
      payload: {
        method: 'vipps' | 'email' | 'sso';
      };
    }
  | {
      name: 'logout';
      payload: Record<string, never>;
    };

/** Hent ut gyldige event-navn som string-literal union. */
export type AnalyticsEventName = AnalyticsEvent['name'];

/** Hent ut payload-typen for et gitt event-navn. Brukes av adapter-signatures. */
export type AnalyticsEventPayload<N extends AnalyticsEventName> = Extract<
  AnalyticsEvent,
  { name: N }
>['payload'];

/**
 * Valuta-konstant. Alle beløp i alle events antas å være i denne. ADR-0005
 * (kun Norge). Endring krever ADR-revisjon.
 */
export const ANALYTICS_CURRENCY = 'NOK' as const;
