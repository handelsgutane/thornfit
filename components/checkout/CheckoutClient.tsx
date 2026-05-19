'use client';

/**
 * CheckoutClient — full checkout-side (Paper 5MI-0 / 5Y7-0).
 *
 * Layout:
 *   Desktop: 2 kolonner — venstre form (kontakt, adresse, levering, betaling,
 *   notat), høyre sticky ordreoppsummering + "Bekreft ordre"-CTA.
 *   Mobile: lineær stack — collapsed ordresummering på topp, deretter form.
 *   Sticky bottom-bar med total + CTA.
 *
 * Pricing:
 *   Bruker `useCartTotals()` direkte — ingen ekstra Redis/volum-prising.
 *   Cart-store er authoritative; MVA er allerede broken ut der.
 *
 * Shipping:
 *   Hardkodet to valg (`lib/checkout/shipping.ts`) for MVP. Senere syncet
 *   fra Woo shipping-zones.
 *
 * Payment:
 *   Faktura + kort. Bekreft-knappen er stub for nå — POSTer ikke til Woo
 *   ennå. Når order-push kobles på, kommer det inn her.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { writeCheckoutConfirmation } from '@/lib/checkout/confirmation-storage';
import type { CheckoutOrderConfirmation } from '@/lib/checkout/confirmation-types';
import { QuantityStepper } from '@/components/cart/QuantityStepper';
import { AccountPrompt } from '@/components/checkout/AccountPrompt';
import { CardPaymentModal } from '@/components/checkout/CardPaymentModal';
import { GiftCardModal } from '@/components/checkout/GiftCardModal';
import { Toast, useToast } from '@/components/ui/Toast';
import { cartItemToAnalyticsItem, track } from '@/lib/analytics';
import { removeFromCart, setQuantity } from '@/lib/cart/api';
import { useCartItems, useCartTotals } from '@/lib/cart/hooks';
import { formatNok } from '@/lib/cart/totals';
import {
  SHIPPING_METHODS,
  getDefaultShippingMethod,
  type ShippingMethod,
} from '@/lib/checkout/shipping';
import {
  COUNTRIES,
  DEFAULT_COUNTRY_CODE,
  getCountry,
} from '@/lib/checkout/countries';
import { usePostalLookup } from '@/lib/checkout/usePostalLookup';

// Paper H0A-0 delivery-method-section options. SVG-ikoner inline
// (16×16, currentColor stroke) — `text-ink` på parent gir riktig farge.
const TRUCK_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path
      d="M1.5 4.5h8v6.5h-8z M9.5 7h3l1.5 2v2H9.5z"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <circle cx="4.5" cy="12" r="1.3" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="11.5" cy="12" r="1.3" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);
const STORE_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path
      d="M2 4.5h12v9H2z"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <path
      d="M2 4.5l1-2h10l1 2"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <path d="M6 13.5V8.5h4v5" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

interface DeliveryOption {
  id: 'send' | 'pickup';
  title: string;
  description: string;
  icon: React.ReactNode;
}

const DELIVERY_OPTIONS: readonly DeliveryOption[] = [
  {
    id: 'send',
    title: 'Sende til meg',
    description: 'Levering til din adresse. 1–3 virkedager.',
    icon: TRUCK_ICON,
  },
  {
    id: 'pickup',
    title: 'Pickup i butikk',
    description: 'Hent selv hos Knivsliperiet, Grünerløkka. Gratis.',
    icon: STORE_ICON,
  },
];

interface ContactForm {
  email: string;
  phone: string;
}

interface AddressForm {
  country: string;
  company: string;
  firstName: string;
  lastName: string;
  street: string;
  /** Adresselinje 2 — vises kun når brukeren har klikket "+ Legg til adresselinje 2". */
  street2: string;
  postalCode: string;
  city: string;
  /** Telefon spesifikk for leveringsadressen (valgfritt). */
  phone: string;
}

/** Server-injected prefill fra innlogget brukers billing-adresse. */
export interface CheckoutPrefill {
  contact: {
    email: string;
    phone: string;
  };
  address: {
    country: string;
    company: string;
    firstName: string;
    lastName: string;
    street: string;
    street2: string;
    postalCode: string;
    city: string;
    phone: string;
  };
}

interface CheckoutClientProps {
  /** Server-injected: er brukeren innlogget? Brukes til å vise eller skjule
   *  "Har du konto?"-banneret (Paper GO9-0). Default false (utlogget). */
  isAuthenticated?: boolean;
  /** Server-injected: pre-filled contact + leveringsadresse fra WC billing.
   *  Undefined når utlogget eller når Woo-kallet feilet. */
  prefill?: CheckoutPrefill;
}

export function CheckoutClient({
  isAuthenticated = false,
  prefill,
}: CheckoutClientProps = {}) {
  const items = useCartItems();
  const baseTotals = useCartTotals();

  // Delivery-mode (over shipping-method): "send" (Posten) eller "pickup"
  // (henting i butikk). Default = "send".
  const [deliveryMode, setDeliveryMode] = useState<'send' | 'pickup'>('send');
  const [shippingId, setShippingId] = useState(getDefaultShippingMethod().id);
  // Betalingsmåte: kun "Kort" og "Gavekort" som valg på checkout-siden.
  // Faktura/Vipps/Klarna/etc. er flyttet til neste-side gateway.
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'gift-card'>('card');
  const [contact, setContact] = useState<ContactForm>({
    email: prefill?.contact.email ?? '',
    phone: prefill?.contact.phone ?? '',
  });
  // `address` er nå PRIMÆR leveringsadressen. Faktura-adressen er som
  // standard den samme; brukeren må eksplisitt skru av "Bruk samme
  // adresse for faktura"-toggelen for å oppgi en separat fakturaadresse.
  // Initial-verdier prefylles fra server-side `wooFetchCustomerAddresses`
  // (billing) når brukeren er innlogget.
  const [address, setAddress] = useState<AddressForm>({
    country:    prefill?.address.country    ?? DEFAULT_COUNTRY_CODE,
    company:    prefill?.address.company    ?? '',
    firstName:  prefill?.address.firstName  ?? '',
    lastName:   prefill?.address.lastName   ?? '',
    street:     prefill?.address.street     ?? '',
    street2:    prefill?.address.street2    ?? '',
    postalCode: prefill?.address.postalCode ?? '',
    city:       prefill?.address.city       ?? '',
    phone:      prefill?.address.phone      ?? '',
  });
  /** "+ Legg til adresselinje 2" — utvides på klikk for å unngå støy i
   *  vanligste case (én-linje-adresse). Auto-utvidet hvis prefill har
   *  innhold på linje 2. */
  const [showAddress2, setShowAddress2] = useState(
    Boolean(prefill?.address.street2),
  );
  // INVERTERT toggle vs tidligere: default = TRUE (samme adresse for faktura).
  // Når av, samles separat fakturaadresse i `billingAddress`. Vanligste
  // case er at de to er like.
  const [useSameForBilling, setUseSameForBilling] = useState(true);
  /** Helper-derivativ for å gjenbruke postal-lookup-logikk uten å endre
   *  effects under. Backwards-compat: tidligere het flagget
   *  `useDifferentShipping`. */
  const useDifferentShipping = !useSameForBilling;
  // `shippingAddress` brukes nå som FAKTURA-adresse når `useSameForBilling`
  // er av. Variabelnavnet er beholdt for å unngå mass-rename gjennom alle
  // useEffect-er og setShippingAddress-calls i fila.
  const [shippingAddress, setShippingAddress] = useState<AddressForm>({
    country: DEFAULT_COUNTRY_CODE,
    company: '',
    firstName: '',
    lastName: '',
    street: '',
    street2: '',
    postalCode: '',
    city: '',
    phone: '',
  });
  const [shippingCityManuallyEdited, setShippingCityManuallyEdited] =
    useState(false);
  const shippingPostalLookup = usePostalLookup(
    useDifferentShipping && shippingAddress.country === 'NO'
      ? shippingAddress.postalCode
      : '',
  );

  useEffect(() => {
    if (shippingCityManuallyEdited) return;
    if (shippingPostalLookup.status === 'valid' && shippingPostalLookup.city) {
      setShippingAddress((prev) =>
        prev.city === shippingPostalLookup.city
          ? prev
          : { ...prev, city: shippingPostalLookup.city! },
      );
    }
  }, [shippingPostalLookup.status, shippingPostalLookup.city, shippingCityManuallyEdited]);
  const [orderNote, setOrderNote] = useState('');
  const [pending, startTransition] = useTransition();
  const { toastProps, showToast } = useToast();
  // Card-payment-modalen åpnes etter at Woo-ordren er opprettet og Nexi-
  // payment-session er initiert. Mounter NEXI sin sikre betalings-iframe.
  const [cardModalOpen, setCardModalOpen] = useState(false);

  // Nexi-session-state: returneres fra /api/payments/nexi/init og passes til
  // CardPaymentModal. `null` = init ikke ferdig (modal viser skeleton).
  const [nexiSession, setNexiSession] = useState<{
    paymentId: string;
    checkoutKey: string;
    environment: 'test' | 'live';
  } | null>(null);

  // Confirmation-data lagres her så vi kan skrive sessionStorage idet Nexi
  // sier "payment-completed". Inneholder full ordre-snapshot fanget fra
  // form/cart-state ved submit-tid + orderId/orderNumber fra API-respons,
  // pluss redirectUrl. Når Nexi bekrefter, skriver vi `confirmation` (uten
  // redirectUrl) til sessionStorage så `/ordre-bekreftet/[id]`-siden kan
  // rendre rik view uten å hente noe fra serveren.
  const pendingConfirmationRef = useRef<{
    confirmation: CheckoutOrderConfirmation;
    redirectUrl: string;
  } | null>(null);
  // Gift-card-modalen åpnes når brukeren KLIKKER Gavekort-radio
  // (ikke på submit). To distinkte states basert på isAuthenticated.
  const [giftCardModalOpen, setGiftCardModalOpen] = useState(false);
  // Aktivt gavekort: settes når bruker har lagt til en kode i modalen.
  // `null` = ingen gavekort er aktivert. Beløp brukes til å beregne
  // restbeløp som må betales med en annen metode.
  const [appliedGiftCard, setAppliedGiftCard] = useState<{
    code: string;
    validUntil: string;
    amount: number;
  } | null>(null);

  // Router brukes til redirect etter vellykket ordre-create.
  const router = useRouter();

  // Idempotency-key — beholder seg på tvers av retries innen samme submit-
  // attempt. Bumpes til ny UUID etter at vi har et endelig resultat (suksess
  // → klare for ny ordre; harde feil → klare for klean retry uten å treffe
  // cached lock). Vi bruker `crypto.randomUUID()` (tilgjengelig i alle
  // moderne nettlesere). Ref-pattern så endring ikke forårsaker re-render.
  const idempotencyKeyRef = useRef<string | null>(null);
  function nextIdempotencyKey(): string {
    const key = crypto.randomUUID();
    idempotencyKeyRef.current = key;
    return key;
  }
  function currentOrNewIdempotencyKey(): string {
    return idempotencyKeyRef.current ?? nextIdempotencyKey();
  }

  // Postnummer-oppslag mot Bring. Kun aktivt når land=NO. For andre land
  // hopper vi over auto-fyll — Bring-API'et er Norge-only, og vi vil ikke
  // ha falske valid/invalid-statuser. Brukeren skriver inn by manuelt.
  const [cityManuallyEdited, setCityManuallyEdited] = useState(false);
  const postalLookup = usePostalLookup(
    address.country === 'NO' ? address.postalCode : '',
  );
  const selectedCountry = getCountry(address.country) ?? COUNTRIES[0];

  useEffect(() => {
    if (cityManuallyEdited) return;
    if (postalLookup.status === 'valid' && postalLookup.city) {
      setAddress((prev) =>
        prev.city === postalLookup.city
          ? prev
          : { ...prev, city: postalLookup.city! },
      );
    }
  }, [postalLookup.status, postalLookup.city, cityManuallyEdited]);

  const shipping: ShippingMethod =
    SHIPPING_METHODS.find((m) => m.id === shippingId) ?? SHIPPING_METHODS[0];

  // Effektiv frakt-kost: 0 når delivery-mode er pickup (henting i butikk),
  // ellers selve shipping-method-prisen. Brukes overalt summary'en
  // viser "Frakt"/total — så Pickup gir gratis levering konsistent.
  const effectiveShippingCost = deliveryMode === 'pickup' ? 0 : shipping.cost;
  const effectiveShippingLabel =
    deliveryMode === 'pickup' ? 'Henting i butikk' : shipping.title;

  // Begin-checkout-event: fyres én gang når siden mountes med en ikke-tom
  // kurv. Dette er e-com-standard tracking-event:
  //   GA4:    `begin_checkout`
  //   Meta:   `InitiateCheckout` (mappes via adapters/meta.ts)
  //   TikTok: `InitiateCheckout` (mappes via adapters/tiktok.ts)
  // CAPI server-side fyres parallelt via track() — se ADR-0010.
  // useRef-flag for å unngå dobbel-fire i dev StrictMode.
  const beginCheckoutFiredRef = useRef(false);
  useEffect(() => {
    if (beginCheckoutFiredRef.current) return;
    if (items.length === 0) return;
    beginCheckoutFiredRef.current = true;
    track({
      name: 'begin_checkout',
      payload: {
        items: items.map(cartItemToAnalyticsItem),
        value: baseTotals.subtotal,
      },
    });
  }, [items, baseTotals.subtotal]);

  // Synk telefon: én kilde til sannhet er `contact.phone`. Adresse-objektet
  // beholder phone-feltet fordi WC shipping-address forventer det, men
  // verdien følger alltid kontakt-feltet — ingen separate input under
  // adressen lenger.
  useEffect(() => {
    if (address.phone === contact.phone) return;
    setAddress((prev) => ({ ...prev, phone: contact.phone }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.phone]);

  // Total inkl. shipping. Bruker effectiveShippingCost så Pickup gir
  // gratis levering (cost 0) selv om en shipping-method er pre-selected.
  const totalWithShipping = useMemo(
    () => baseTotals.subtotal + effectiveShippingCost,
    [baseTotals.subtotal, effectiveShippingCost],
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (items.length === 0) {
      showToast({ variant: 'error', message: 'Kurven din er tom.' });
      return;
    }

    // Betaling-flyt avhenger av valgt metode:
    //   - 'card'      → opprett Woo-ordre med status `pending` mot
    //                   `/api/checkout/order`. NEXI-betaling kobles på
    //                   senere (avtale 2026-05-06): da vil suksess-handler
    //                   åpne CardPaymentModal med returned `orderId` i
    //                   stedet for å redirecte til takk-for-handelen.
    //                   Inntil videre redirecter vi direkte etter create.
    //   - 'gift-card' → egen flyt for gavekort (ikke implementert ennå).
    if (paymentMethod === 'card') {
      void submitCardOrder();
      return;
    }

    if (paymentMethod === 'gift-card') {
      // Hvis ingen gavekort er aktivert → åpne modalen for å legge til.
      if (!appliedGiftCard) {
        setGiftCardModalOpen(true);
        return;
      }
      // Gavekort er aktivert: åpne kort-modalen for å betale restbeløp.
      // Hvis hele beløpet dekkes av gavekortet, fullfør ordren direkte.
      const remaining = totalWithShipping - appliedGiftCard.amount;
      if (remaining <= 0) {
        showToast({
          variant: 'success',
          message: 'Demo: gavekort dekker hele beløpet — ordre-flyt kommer.',
        });
        return;
      }
      setCardModalOpen(true);
      return;
    }
  }

  /**
   * Skriv ordre-bekreftelse til sessionStorage og redirect til
   * `/ordre-bekreftet/[id]`. Kalles fra CardPaymentModal-en når Nexi sier
   * `payment-completed`. Den fulle ordre-konfirmasjonen er allerede fanget
   * i `pendingConfirmationRef` ved /api/checkout/order-responsen.
   *
   * Vi oppdaterer `status` til `processing` her — Nexi har bekreftet
   * reservasjonen, og webhook-handleren flytter Woo-ordren parallelt.
   * Selv om webhook lander etter klient-redirect, viser confirmation-
   * siden riktig status fra start.
   */
  function handleNexiSuccess(): void {
    const c = pendingConfirmationRef.current;
    if (!c) {
      // Skulle ikke skje — defensive fallback til konto-side.
      router.push('/konto/ordrer');
      return;
    }
    writeCheckoutConfirmation({
      ...c.confirmation,
      status: 'processing',
    });
    pendingConfirmationRef.current = null;
    idempotencyKeyRef.current = null;
    if (/^https?:\/\//.test(c.redirectUrl)) {
      window.location.href = c.redirectUrl;
    } else {
      router.push(c.redirectUrl);
    }
  }

  /**
   * Send checkout-payload til `/api/checkout/order` (steg 1) og deretter
   * `/api/payments/nexi/init` (steg 2), og åpne CardPaymentModal med
   * resultatet.
   *
   * Flyt:
   *   - Steg 1: bygg payload fra current form state, POST til
   *     /api/checkout/order. Server recomputer priser.
   *   - Hvis steg 1 lykkes: lagre confirmation-data i ref (brukes når
   *     Nexi sier "completed"), kall steg 2.
   *   - Steg 2: POST til /api/payments/nexi/init med {orderId, orderKey}.
   *     På success: lagre {paymentId, checkoutKey, environment} i state
   *     og åpne kort-modalen.
   *   - PRICE_DRIFT: bump ny key — vi vil ikke at retry skal treffe cache
   *     med gamle priser.
   *   - IN_FLIGHT: ikke bump key; vent og prøv igjen.
   *   - Andre feil: behold key, vis feil-toast.
   *
   * NB: Idempotency-key tømmes IKKE her — vi venter til Nexi har bekreftet
   * betalingen i `handleNexiSuccess`. Det betyr at hvis brukeren lukker
   * modal-en uten å betale og klikker Bekreft igjen, vil samme idempotency-
   * key brukes mot /api/checkout/order. Server returnerer cache-hit og vi
   * får samme ordre-id i steg 1, og steg 2 init-er en NY Nexi-payment hvis
   * den gamle er stale (init-routen håndterer det).
   */
  async function submitCardOrder(): Promise<void> {
    const expectedTotal = totalWithShipping;
    const idempotencyKey = currentOrNewIdempotencyKey();

    // Mapper UI-state til API-payload. Server validerer alt — vi må ikke
    // dobbel-validere her, men vi kan tidlig-returnere på tomme felter for å
    // unngå unødig round-trip. (Form-feltene er allerede `required` så
    // browseren stopper submit; denne grenen er kun en sikkerhetsline.)
    const billingAddress = useSameForBilling
      ? null
      : addressFormToApi(shippingAddress);

    const body = {
      idempotencyKey,
      contact: {
        email: contact.email.trim().toLowerCase(),
        phone: contact.phone.trim(),
      },
      deliveryMode,
      shippingMethodId: deliveryMode === 'pickup' ? null : shippingId,
      shippingAddress: addressFormToApi(address),
      billingAddress,
      paymentMethodId: 'card' as const,
      customerNote: orderNote.trim(),
      items: items.map((i) => ({
        productId: i.productId,
        variationId: i.variationId,
        quantity: i.quantity,
      })),
      // Coupon-koder er ikke wired i UI ennå; cart-store har feltet men
      // ingen apply-flyt eksisterer. Sender tom liste — backend tolererer
      // det og hopper over coupon-evaluering.
      couponCodes: [] as string[],
      expectedTotal,
    };

    startTransition(async () => {
      try {
        // ── Steg 1: opprett Woo-ordre ────────────────────────────────────
        const orderRes = await fetch('/api/checkout/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          cache: 'no-store',
        });

        const orderData = (await orderRes.json().catch(() => null)) as
          | {
              ok: true;
              orderId: number;
              orderNumber: string;
              orderKey: string;
              status: string;
              total: number;
              currency: string;
              redirectUrl: string;
            }
          | { ok: false; code?: string; error?: string }
          | null;

        if (!orderRes.ok || !orderData || orderData.ok !== true) {
          const errorPayload =
            orderData && orderData.ok === false ? orderData : null;
          handleOrderApiError(errorPayload, orderRes);
          return;
        }

        // Bygg full ordre-konfirmasjon som senere skrives til sessionStorage
        // av handleNexiSuccess. Inneholder snapshot av cart + form state ved
        // submit-tid; OrderConfirmedView leser dette og rendrer rik UI uten
        // å hente noe fra serveren.
        const fullConfirmation: CheckoutOrderConfirmation = {
          orderId: orderData.orderId,
          orderNumber: orderData.orderNumber,
          status: orderData.status,
          total: orderData.total,
          currency: orderData.currency,
          customerEmail: contact.email.trim().toLowerCase(),
          customerFirstName: address.firstName.trim(),
          paymentMethodTitle: paymentMethod === 'card' ? 'Kort' : 'Faktura',
          createdAt: new Date().toISOString(),
          items: items.map((item) => ({
            name: item.name,
            brand: item.brand,
            sku: item.sku,
            specLine: item.specLine,
            imageUrl: item.imageUrl,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: round2Money(item.unitPrice * item.quantity),
          })),
          subtotalExVat: round2Money(baseTotals.subtotalExVat),
          vat: round2Money(baseTotals.vat),
          savings: round2Money(baseTotals.savings),
          shippingCost: effectiveShippingCost,
          shippingLabel: effectiveShippingLabel,
          shippingAddress: {
            company: address.company.trim(),
            firstName: address.firstName.trim(),
            lastName: address.lastName.trim(),
            addressLine1: address.street.trim(),
            addressLine2: address.street2.trim(),
            postalCode: address.postalCode.trim(),
            city: address.city.trim(),
          },
          shippingMethod: effectiveShippingLabel,
        };
        pendingConfirmationRef.current = {
          confirmation: fullConfirmation,
          redirectUrl: orderData.redirectUrl,
        };

        // ── Steg 2: init Nexi-payment ────────────────────────────────────
        const nexiRes = await fetch('/api/payments/nexi/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: orderData.orderId,
            orderKey: orderData.orderKey,
          }),
          cache: 'no-store',
        });

        const nexiData = (await nexiRes.json().catch(() => null)) as
          | {
              ok: true;
              paymentId: string;
              checkoutKey: string | null;
              environment: 'test' | 'live';
            }
          | { ok: false; error?: string }
          | null;

        if (!nexiRes.ok || !nexiData || nexiData.ok !== true) {
          showToast({
            variant: 'error',
            message:
              (nexiData && nexiData.ok === false && nexiData.error) ||
              'Kunne ikke starte kortbetalingen. Prøv igjen.',
          });
          return;
        }

        if (!nexiData.checkoutKey) {
          showToast({
            variant: 'error',
            message:
              'Betalingstjenesten er ikke konfigurert (mangler frontend-key). Kontakt support.',
          });
          return;
        }

        // ── Steg 3: åpne modal ───────────────────────────────────────────
        setNexiSession({
          paymentId: nexiData.paymentId,
          checkoutKey: nexiData.checkoutKey,
          environment: nexiData.environment,
        });
        setCardModalOpen(true);
      } catch (err) {
        // Nettverksfeil — behold key så retry treffer cache hvis ordren
        // faktisk ble opprettet.
        console.error('[checkout] submitCardOrder failed', err);
        showToast({
          variant: 'error',
          message: 'Nettverksfeil. Sjekk forbindelsen og prøv igjen.',
        });
      }
    });
  }

  /** Mappe feil-respons fra /api/checkout/order til toast + key-håndtering. */
  function handleOrderApiError(
    data: { ok: false; code?: string; error?: string } | null,
    res: Response,
  ): void {
    const code = data?.code;
    const message =
      data?.error ?? 'Vi klarte ikke å opprette ordren. Prøv igjen om litt.';
    // PRICE_DRIFT: bump key — neste forsøk skal gå inn fersk og ikke treffe
    // cached lock som fortsatt sitter på gamle prisene.
    if (code === 'PRICE_DRIFT') {
      nextIdempotencyKey();
    }
    // Logg unormale status-koder for synlighet i dev-tools.
    if (res.status >= 500) {
      console.error('[checkout] /api/checkout/order failed', res.status, data);
    }
    showToast({ variant: 'error', message });
  }

  if (items.length === 0) {
    return (
      <main className="bg-canvas px-sp-3 pb-20 pt-14 md:px-sp-7 lg:px-12">
        <div className="mx-auto max-w-[1320px]" /* paper-exact: 5MI-0 (desktop content width close to 1312) */>
          <p className="text-body-xs uppercase tracking-wide text-ink-muted">
            Handlekurv / Checkout
          </p>
          <h1 className="mt-sp-2 font-bold text-ink text-h1 lg:text-display">
            Checkout
          </h1>
          <p className="mt-sp-7 text-body-md text-ink-muted">
            Kurven din er tom.{' '}
            <Link href="/" className="font-medium text-aka hover:underline">
              Tilbake til butikken →
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="bg-canvas pb-[calc(var(--height-sticky-cta)+60px)] md:pb-20 md:pt-10 lg:pt-14" /* mobile: 60px breathing over sticky checkout-bar */>
        {/* 1320px container nær Paper-bredden (1312px). Sidebar er 440px
            (Paper bruker 460px) så form-kolonnen får ~756px på desktop.
            Mobil: px 0 (kortene har egen mx 16 via Section-padding). */}
        <div className="mx-auto max-w-[1320px] md:px-sp-7 lg:px-12" /* paper-exact: 5MI-0 (desktop content width close to 1312) */>
          {/* Page header — Paper 5ZH-0 (mobil pt 24 / pb 20 / px 20, gap 6).
              Desktop beholder mt-sp-2 mb-sp-7 + text-h1/display. */}
          <header className="flex flex-col gap-1.5 px-5 pt-6 pb-3 md:gap-0 md:px-0 md:pt-0 md:pb-0">
            <p
              className="font-bold uppercase text-ink-muted"
              style={{ fontSize: '11px', lineHeight: '14px', letterSpacing: '0.1em' }} /* paper-exact: 5ZI-0 / 5O2-0 (11/14 bold haiiro 0.1em — identisk på mobil og desktop) */
            >
              <Link href="/handlekurv" className="transition-colors hover:text-ink">Handlekurv</Link>
              <span aria-hidden className="mx-sp-2">/</span>
              <span aria-current="page">Checkout</span>
            </p>
            <h1
              className="font-bold text-ink md:mt-1 md:mb-sp-4 md:text-h1 lg:text-display"
              style={{ fontSize: '28px', lineHeight: '34px', letterSpacing: '-0.02em' }} /* paper-exact: 5ZJ-0 (mobile h1 28/34, -0.02em) */
            >
              Checkout
            </h1>
          </header>

          {/* Mobil-collapse: ordresummering på toppen — Paper 5ZK-0 mb 8 */}
          <div className="mb-2 px-4 md:mb-sp-5 md:px-0 lg:hidden">
            <MobileOrderSummary
              items={items}
              total={totalWithShipping}
              subtotalExVat={baseTotals.subtotalExVat}
              shippingCost={effectiveShippingCost}
              savings={baseTotals.savings}
              vat={baseTotals.vat}
            />
          </div>

          <form
            onSubmit={handleSubmit}
            className="px-4 lg:flex lg:items-start lg:gap-sp-5 lg:px-0" /* gap matches vertical section gap (sp-5 / 32px) */
          >
            {/* Form-kolonne — mobile section gap 8 (Paper mt 8), desktop sp-5 */}
            <div className="flex flex-1 min-w-0 flex-col gap-2 md:gap-sp-5">
              {/* "Har du konto?"-banner — kun synlig når brukeren er utlogget.
                  Paper GO9-0 plasserer den øverst i form-kolonnen, før
                  Kontaktinformasjon. Server-injected `isAuthenticated`-flagg
                  fra page.tsx (lest fra WP-auth-cookie). */}
              {!isAuthenticated && <AccountPrompt returnTo="/checkout" />}

              <Section
                title="Kontaktinformasjon"
                helperText="Vi vil bruke denne e-postadressen til å sende deg detaljer og oppdateringer om din ordre."
              >
                <Field label="E-postadresse">
                  <input
                    type="email"
                    required
                    value={contact.email}
                    onChange={(e) => setContact({ ...contact, email: e.target.value })}
                    className={inputClass}
                    placeholder="navn@epost.no"
                  />
                </Field>
                <Field label="Telefon">
                  <input
                    type="tel"
                    required
                    value={contact.phone}
                    onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                    className={inputClass}
                    placeholder="+47 XXX XX XXX"
                  />
                </Field>
              </Section>

              {/* Levering-mode: Send vs. Pickup. Når Pickup velges, skjules
                  Leveringsadresse + Fraktvalg lenger ned. Paper H0A-0:
                  vertikal stack av kort med radio-dot + icon + tittel +
                  beskrivelse. Aktiv = 2px aka-border på shiro (ingen tint).
                  Inaktiv = 1px sakai.
                  NB: ingen Section-wrapper — kortene står frittstående
                  på canvas bg, ikke nested i en outer hvit container. */}
              <section className="flex flex-col gap-sp-3" aria-labelledby="delivery-method-title">
                <span
                  id="delivery-method-title"
                  className="block font-bold uppercase text-ink-muted"
                  style={{ fontSize: '11px', lineHeight: '14px', letterSpacing: '0.1em' }} /* paper-exact: H0B-0 (11/14 bold haiiro 0.1em) */
                >
                  Leveringsmåte
                </span>
                {/* Mobil: stablet vertikalt (Paper H0C-0). Desktop: 50/50
                    side-ved-side via grid-cols-2 så begge kortene tar lik
                    plass. `items-stretch` (default på grid) gjør at høyden
                    matches selv om beskrivelse-tekstene har ulik lengde. */}
                <div className="flex flex-col gap-sp-2 md:grid md:grid-cols-2 md:gap-sp-3" /* paper-exact: H0C-0 (gap 8 mobile, 50/50 grid desktop) */>
                  {DELIVERY_OPTIONS.map((opt) => {
                    const checked = deliveryMode === opt.id;
                    return (
                      <label
                        key={opt.id}
                        className={[
                          'flex cursor-pointer items-start gap-3 rounded-1 px-3.5 py-3.5 transition-colors', /* paper-exact: H0D-0 (padding 14/14, gap 12) */
                          checked
                            ? 'border-2 border-aka bg-surface' /* paper-exact: H0D-0 (2px aka, bg shiro) */
                            : 'border border-divider bg-surface hover:border-ink',
                        ].join(' ')}
                      >
                        <input
                          type="radio"
                          name="delivery-mode"
                          value={opt.id}
                          checked={checked}
                          onChange={() => setDeliveryMode(opt.id)}
                          className="sr-only"
                        />
                        {/* Custom radio-dot — Paper H0E-0/H0F-0: 18×18 sirkel
                            med 2px border (aka når aktiv, sakai når inaktiv).
                            Aktiv har 8×8 fylt aka-dot inne. */}
                        <span
                          aria-hidden
                          className={[
                            'mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full border-2', /* paper-exact: HF3-0 / HFP-0 (18×18 radio dot) */ /* paper-exact: H0E-0 (18×18 border 2) */
                            checked ? 'border-aka' : 'border-divider',
                          ].join(' ')}
                        >
                          {checked && (
                            <span
                              className="size-2 rounded-full bg-aka" /* paper-exact: H0F-0 (8×8 aka dot) */
                            />
                          )}
                        </span>

                        <span className="flex flex-1 flex-col gap-1" /* paper-exact: H0G-0 (col gap 4) */>
                          <span className="flex items-center gap-sp-2" /* paper-exact: H0H-0 (row gap 8) */>
                            <span aria-hidden className="text-ink">
                              {opt.icon}
                            </span>
                            <span
                              className="font-bold text-ink"
                              style={{ fontSize: '14px', lineHeight: '18px', letterSpacing: '-0.01em' }} /* paper-exact: H0Q-0 (14/18 bold -0.01em) */
                            >
                              {opt.title}
                            </span>
                          </span>
                          <span
                            className="text-ink-muted"
                            style={{ fontSize: '13px', lineHeight: '19px' }} /* paper-exact: H0R-0 (13/19 regular haiiro, 140% line) */
                          >
                            {opt.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>

              {/* Adresse-seksjon — vises både for "send" og "pickup".
                  - Send: tittel "Leveringsadresse", brukes som shipping_address
                    på Woo-ordren (og som billing hvis "Bruk samme"-toggelen
                    er på).
                  - Pickup: tittel "Fakturainformasjon" — kunden henter selv,
                    så vi trenger kun fakturadata (navn, adresse for faktura/
                    kvittering). Toggelen "Bruk samme adresse for faktura"
                    er irrelevant her og skjules. */}
              <Section
                title={deliveryMode === 'pickup' ? 'Fakturainformasjon' : 'Leveringsadresse'}
                helperText={
                  deliveryMode === 'pickup'
                    ? 'Vi trenger fakturainformasjon for å sende kvittering. Du henter ordren i butikken.'
                    : 'Fyll inn adressen til der du vil at ordren skal leveres.'
                }
              >
                <Field label="Land *">
                  <select
                    required
                    value={address.country}
                    onChange={(e) => {
                      // Reset by-feltet ved bytte av land — postnummer-format
                      // kan bli ugyldig, og auto-fyll fra Bring fungerer kun NO.
                      setAddress((prev) => ({
                        ...prev,
                        country: e.target.value,
                        postalCode: '',
                        city: '',
                      }));
                      setCityManuallyEdited(false);
                    }}
                    className={inputClass}
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Firma (valgfritt)">
                  <input
                    type="text"
                    value={address.company}
                    onChange={(e) => setAddress({ ...address, company: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-sp-3">
                  <Field label="Fornavn *">
                    <input
                      type="text"
                      required
                      value={address.firstName}
                      onChange={(e) => setAddress({ ...address, firstName: e.target.value })}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Etternavn *">
                    <input
                      type="text"
                      required
                      value={address.lastName}
                      onChange={(e) => setAddress({ ...address, lastName: e.target.value })}
                      className={inputClass}
                    />
                  </Field>
                </div>
                <Field label="Adresse *">
                  <input
                    type="text"
                    required
                    value={address.street}
                    onChange={(e) => setAddress({ ...address, street: e.target.value })}
                    className={inputClass}
                  />
                </Field>

                {/* "+ Legg til adresselinje 2" — utvides på klikk for å unngå
                    støy i vanligste case (én-linje-adresse). */}
                {showAddress2 ? (
                  <Field label="Adresselinje 2">
                    <input
                      type="text"
                      value={address.street2}
                      onChange={(e) => setAddress({ ...address, street2: e.target.value })}
                      className={inputClass}
                      placeholder="Etasje, leilighet, c/o, …"
                    />
                  </Field>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAddress2(true)}
                    className="-mt-1 self-start font-medium text-aka transition-colors hover:underline"
                    style={{ fontSize: '13px', lineHeight: '16px' }}
                  >
                    + Legg til adresselinje 2
                  </button>
                )}
                <div className="grid grid-cols-[140px_1fr] gap-sp-3">
                  <Field label="Postnummer *">
                    <div className="relative">
                      <input
                        type="text"
                        required
                        inputMode={selectedCountry.code === 'NO' ? 'numeric' : 'text'}
                        maxLength={selectedCountry.postalCodeMaxLength ?? 10}
                        value={address.postalCode}
                        onChange={(e) => {
                          // For NO: kun siffer, max 4. Andre land: trim/upper-case,
                          // men la formatet stå mer fritt — ulike postnummer-formater
                          // verden over (DK 4-digit, GB alfanumerisk, US 5+4, etc.).
                          const raw = e.target.value;
                          const cleaned =
                            selectedCountry.code === 'NO'
                              ? raw.replace(/\D/g, '').slice(0, 4)
                              : raw.slice(0, selectedCountry.postalCodeMaxLength ?? 10);
                          setAddress({ ...address, postalCode: cleaned });
                        }}
                        className={inputClass}
                        aria-invalid={
                          selectedCountry.code === 'NO' && postalLookup.status === 'invalid'
                        }
                      />
                      {/* Status-indikator — kun for NO siden Bring-lookup er
                          Norge-only. Andre land: ingen indikator (brukeren
                          skriver inn by manuelt). */}
                      {selectedCountry.code === 'NO' && (
                        <span
                          aria-hidden
                          className="pointer-events-none absolute right-sp-3 top-1/2 -translate-y-1/2"
                        >
                          {postalLookup.status === 'loading' && (
                            <svg width="14" height="14" viewBox="0 0 14 14" className="animate-spin text-ink-muted">
                              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeDasharray="20 20" />
                            </svg>
                          )}
                          {postalLookup.status === 'valid' && (
                            <svg width="14" height="14" viewBox="0 0 14 14" className="text-aka">
                              <path d="M3 7L6 10L11 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                            </svg>
                          )}
                          {postalLookup.status === 'invalid' && (
                            <svg width="14" height="14" viewBox="0 0 14 14" className="text-aka">
                              <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                            </svg>
                          )}
                        </span>
                      )}
                    </div>
                    {selectedCountry.code === 'NO' && postalLookup.status === 'invalid' && (
                      <span className="mt-1 block text-body-xs text-aka">
                        Ugyldig norsk postnummer.
                      </span>
                    )}
                  </Field>
                  <Field label="By *">
                    <input
                      type="text"
                      required
                      value={address.city}
                      onChange={(e) => {
                        setCityManuallyEdited(true);
                        setAddress({ ...address, city: e.target.value });
                      }}
                      className={inputClass}
                    />
                  </Field>
                </div>

                {/* Telefon-felt er fjernet fra adresse-seksjonen 2026-05.
                    `address.phone` synkes nå automatisk fra `contact.phone`
                    via useEffect (én kilde til sannhet for telefonnummer
                    gjennom hele checkout-flyten). */}

                {/* INVERTERT toggle: default = TRUE (samme adresse for faktura).
                    Når av, viser vi en separat "Fakturaadresse"-Section under.
                    Vanligst er at de to er like; toggle holder default-flowen
                    kort uten å miste fleksibiliteten.
                    Skjult ved pickup — der er adressen ren faktura, ingen
                    shipping vs billing-distinksjon å gjøre. */}
                {deliveryMode === 'send' && (
                  <label className="mt-sp-2 flex cursor-pointer items-center gap-sp-2 select-none">
                    <input
                      type="checkbox"
                      checked={useSameForBilling}
                      onChange={(e) => setUseSameForBilling(e.target.checked)}
                      className="size-[18px] cursor-pointer accent-aka focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2" /* paper-exact: 5MI-0 (checkbox 18×18 mellomstørrelse mellom 16 og 20) */
                    />
                    <span className="text-body-sm text-ink">
                      Bruk samme adresse for faktura
                    </span>
                  </label>
                )}
              </Section>

              {/* Egen fakturaadresse — kun når "Bruk samme adresse for faktura"
                  er AV, og kun når delivery-mode er Send. Speiler shipping-
                  formen visuelt (samme felt og rekkefølge), men bruker
                  `shippingAddress`-state (variabelnavn beholdt for å unngå
                  mass-rename). NO-postnummer-lookup aktivert så by-feltet
                  auto-fylles her også. */}
              {deliveryMode === 'send' && useDifferentShipping && (
                <Section title="Fakturaadresse">
                  <Field label="Land *">
                    <select
                      required
                      value={shippingAddress.country}
                      onChange={(e) => {
                        setShippingAddress((prev) => ({
                          ...prev,
                          country: e.target.value,
                          postalCode: '',
                          city: '',
                        }));
                        setShippingCityManuallyEdited(false);
                      }}
                      className={inputClass}
                    >
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Firma (valgfritt)">
                    <input
                      type="text"
                      value={shippingAddress.company}
                      onChange={(e) =>
                        setShippingAddress({ ...shippingAddress, company: e.target.value })
                      }
                      className={inputClass}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-sp-3">
                    <Field label="Fornavn *">
                      <input
                        type="text"
                        required
                        value={shippingAddress.firstName}
                        onChange={(e) =>
                          setShippingAddress({ ...shippingAddress, firstName: e.target.value })
                        }
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Etternavn *">
                      <input
                        type="text"
                        required
                        value={shippingAddress.lastName}
                        onChange={(e) =>
                          setShippingAddress({ ...shippingAddress, lastName: e.target.value })
                        }
                        className={inputClass}
                      />
                    </Field>
                  </div>
                  <Field label="Adresse *">
                    <input
                      type="text"
                      required
                      value={shippingAddress.street}
                      onChange={(e) =>
                        setShippingAddress({ ...shippingAddress, street: e.target.value })
                      }
                      className={inputClass}
                    />
                  </Field>
                  <div className="grid grid-cols-[140px_1fr] gap-sp-3">
                    <Field label="Postnummer *">
                      <div className="relative">
                        <input
                          type="text"
                          required
                          inputMode={shippingAddress.country === 'NO' ? 'numeric' : 'text'}
                          maxLength={
                            (getCountry(shippingAddress.country) ?? COUNTRIES[0]).postalCodeMaxLength ?? 10
                          }
                          value={shippingAddress.postalCode}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const cleaned =
                              shippingAddress.country === 'NO'
                                ? raw.replace(/\D/g, '').slice(0, 4)
                                : raw.slice(
                                    0,
                                    (getCountry(shippingAddress.country) ?? COUNTRIES[0])
                                      .postalCodeMaxLength ?? 10,
                                  );
                            setShippingAddress({ ...shippingAddress, postalCode: cleaned });
                          }}
                          className={inputClass}
                          aria-invalid={
                            shippingAddress.country === 'NO' &&
                            shippingPostalLookup.status === 'invalid'
                          }
                        />
                        {shippingAddress.country === 'NO' && (
                          <span
                            aria-hidden
                            className="pointer-events-none absolute right-sp-3 top-1/2 -translate-y-1/2"
                          >
                            {shippingPostalLookup.status === 'loading' && (
                              <svg width="14" height="14" viewBox="0 0 14 14" className="animate-spin text-ink-muted">
                                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeDasharray="20 20" />
                              </svg>
                            )}
                            {shippingPostalLookup.status === 'valid' && (
                              <svg width="14" height="14" viewBox="0 0 14 14" className="text-aka">
                                <path d="M3 7L6 10L11 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                              </svg>
                            )}
                            {shippingPostalLookup.status === 'invalid' && (
                              <svg width="14" height="14" viewBox="0 0 14 14" className="text-aka">
                                <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                              </svg>
                            )}
                          </span>
                        )}
                      </div>
                    </Field>
                    <Field label="By *">
                      <input
                        type="text"
                        required
                        value={shippingAddress.city}
                        onChange={(e) => {
                          setShippingCityManuallyEdited(true);
                          setShippingAddress({ ...shippingAddress, city: e.target.value });
                        }}
                        className={inputClass}
                      />
                    </Field>
                  </div>
                </Section>
              )}

              {/* Fraktvalg — kun synlig når delivery-mode er Send. Pickup
                  trenger ikke shipping-method (cost = 0, hentes i butikk). */}
              {deliveryMode === 'send' && (
                <Section title="Fraktvalg">
                  <RadioGroup
                    name="shipping"
                    value={shippingId}
                    onChange={(v) => setShippingId(v as ShippingMethod['id'])}
                    options={SHIPPING_METHODS.map((m) => ({
                      value: m.id,
                      title: m.title,
                      description: m.description,
                      meta: m.cost === 0 ? 'Gratis' : formatNok(m.cost),
                    }))}
                  />
                </Section>
              )}

              {/* Betalingsmåter — Paper HF2-0/HFO-0. Kun "Kort" og "Gavekort"
                  som valg på checkout-siden. Resten (Vipps/Klarna/Apple Pay/
                  Google Pay) håndteres på neste-side NEXI-gateway etter at
                  Kort er valgt her.
                  Layout: rik radio-card-rendering — Kort har 5 card-logoer
                  under tittelen (VISA/MC/AMEX/Vipps/Klarna), Gavekort har
                  gift-box-ikon ved siden av tittelen. */}
              <Section title="Betalingsmåter">
                <PaymentOptions
                  value={paymentMethod}
                  onChange={(v) => {
                    setPaymentMethod(v);
                    // Klikk på Gavekort-radio → åpne modal umiddelbart
                    // (ikke vent til Bekreft). Modal håndterer applied-state.
                    if (v === 'gift-card' && !appliedGiftCard) {
                      setGiftCardModalOpen(true);
                    }
                  }}
                />
              </Section>

              {/* Gaveinnpakning — sesong-notice som strammes/fjernes utenom jul. */}
              <aside
                role="note"
                className="rounded-1 border border-aka/30 bg-aka/[0.03] px-4 py-3.5 text-body-sm text-ink"
              >
                <strong className="font-bold">NB! Gaveinnpakning:</strong>{' '}
                Dessverre har vi ikke mulighet til å pakke inn i gavepapir før
                jul pga. stort volum. Ta kontakt på chatten før du handler hvis
                du har spesielle ønsker, så skal vi se hvordan vi kan hjelpe deg.
              </aside>

              <Section title="Legg til en melding til ordren din">
                <textarea
                  value={orderNote}
                  onChange={(e) => setOrderNote(e.target.value)}
                  rows={3}
                  className={`${inputClass} resize-none`}
                  placeholder="Spesielle instruksjoner for levering, gaveønsker, eller annet…"
                />
              </Section>
            </div>

            {/* Sticky ordresummering — desktop. Skjult på mobil (vises i top-collapse).
                460px matcher Paper-design'et eksakt og gir rom for line-items
                med thumbnail + tittel + stepper på samme rad. */}
            <aside className="hidden lg:sticky lg:top-[100px] lg:block lg:w-[460px] lg:shrink-0 lg:self-start" /* paper-exact: 5MI-0 (sidebar 460 width, top 100 = utility 28 + header 72) */>
              <OrderSummary
                items={items}
                shippingLabel={effectiveShippingLabel}
                shippingCost={effectiveShippingCost}
                subtotalExVat={baseTotals.subtotalExVat}
                vat={baseTotals.vat}
                savings={baseTotals.savings}
                total={totalWithShipping}
                pending={pending}
                appliedGiftCard={appliedGiftCard}
                onRemoveGiftCard={() => setAppliedGiftCard(null)}
              />
            </aside>
          </form>
        </div>
      </main>

      {/* Mobil sticky bottom-bar — Paper 6B1-0 (default) / JMT-1 (gavekort-state).
          Når gavekort er aktivert: label "Gjenstående", total = restbeløp,
          ekstra gavekort-badge ("Gavekort −kr X / trukket fra totalen") under,
          CTA "Betal kr X". */}
      {(() => {
        const hasGiftCard = appliedGiftCard !== null;
        const remaining = hasGiftCard
          ? Math.max(totalWithShipping - appliedGiftCard.amount, 0)
          : totalWithShipping;
        return (
          <div
            className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-sp-3 border-t border-divider bg-surface px-sp-3 pt-sp-2 pb-7 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] lg:hidden" /* paper-exact: 6B1-0 / JMT-1 (pt 12, pb 28, px 16, gap 12) */
          >
            <div className="flex shrink-0 flex-col gap-px" /* paper-exact: 6B2-0 / JTT-1 */>
              <span className="text-ink-muted" style={{ fontSize: hasGiftCard ? '10px' : '11px', lineHeight: hasGiftCard ? '12px' : '14px', letterSpacing: hasGiftCard ? '0.05em' : 'normal', textTransform: hasGiftCard ? 'uppercase' : 'none', fontWeight: hasGiftCard ? 700 : 400 }} /* paper-exact: 6B3-0 (11/14 haiiro) / JTU-1 (10px uppercase når gavekort) */>
                {hasGiftCard ? 'Gjenstående' : 'Total inkl. MVA'}
              </span>
              <span className="font-bold text-ink" style={{ fontSize: '18px', lineHeight: '22px', letterSpacing: '-0.02em' }} /* paper-exact: 6B4-0 / JTV-1 (18/22 bold -0.02em) */>
                {formatNok(remaining)}
              </span>
              {hasGiftCard && (
                <span
                  className="mt-0.5 flex items-start gap-1 text-ink-muted" /* paper-exact: JU2-1 (gavekort-badge) */
                  style={{ fontSize: '10px', lineHeight: '13px' }} /* paper-exact: JU8-1 (10/13) */
                >
                  <svg width="11" height="11" viewBox="0 0 13 13" className="mt-px shrink-0 text-midori" aria-hidden>
                    <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.3" fill="none" />
                    <path d="M4 6.5L5.5 8L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </svg>
                  <span className="flex flex-col">
                    <span>Gavekort −{formatNok(appliedGiftCard.amount)}</span>
                    <span>trukket fra totalen</span>
                  </span>
                </span>
              )}
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                const form = document.querySelector('form');
                if (form) form.requestSubmit();
              }}
              className="flex flex-1 items-center justify-center rounded-1 bg-aka px-sp-3 py-3.5 font-bold text-shiro transition-opacity hover:opacity-90 disabled:opacity-60" /* paper-exact: 6B5-0 / JMU-1 (padding 14/16, bg aka) */
              style={{ fontSize: '14px', lineHeight: '18px', letterSpacing: '-0.01em' }} /* paper-exact: 6B6-0 / JMV-1 (14/18 bold -0.01em) */
            >
              {pending
                ? 'Behandler…'
                : hasGiftCard
                  ? `Betal ${formatNok(remaining)}`
                  : 'Bekreft ordre'}
            </button>
          </div>
        );
      })()}

      {/* Kort-betaling-modal — åpnes når både Woo-ordre og Nexi-payment-
          session er opprettet. Mounter Nexi sitt embedded-checkout-bibliotek
          inne i iframe-containeren. `payment-completed`-event kaller
          handleNexiSuccess() som skriver sessionStorage og redirecter. */}
      <CardPaymentModal
        open={cardModalOpen}
        onClose={() => {
          setCardModalOpen(false);
          // Lukk uten å betale: behold nexiSession så retry kan gjenbruke
          // samme paymentId. idempotency-key beholdes også.
        }}
        paymentId={nexiSession?.paymentId ?? null}
        checkoutKey={nexiSession?.checkoutKey ?? null}
        environment={nexiSession?.environment ?? 'test'}
        onSuccess={handleNexiSuccess}
        onError={(message) => showToast({ variant: 'error', message })}
      />

      {/* Gavekort-modal — åpnes når Bekreft-knappen submitter med
          paymentMethod='gift-card'. Viser logged-in/out-state basert på
          server-injected `isAuthenticated`. Etter applied gavekort + bruker
          klikker "Bruk gavekort + velg betaling" → kort-modalen åpnes for
          restbeløp. */}
      <GiftCardModal
        open={giftCardModalOpen}
        onClose={() => {
          setGiftCardModalOpen(false);
          // Hvis bruker lukker uten å ha aktivert gavekort, fall tilbake
          // til 'card' så Bekreft-knappen ikke prøver å fortsette med
          // ufullstendig gavekort-state.
          if (!appliedGiftCard) {
            setPaymentMethod('card');
          }
        }}
        isAuthenticated={isAuthenticated}
        amount={totalWithShipping}
        user={
          prefill && contact.email
            ? {
                displayName: [prefill.address.firstName, prefill.address.lastName]
                  .filter(Boolean)
                  .join(' ') || contact.email,
                email: contact.email,
              }
            : undefined
        }
        onApplied={(giftCard) => {
          setAppliedGiftCard(giftCard);
          // Modalen lukker seg selv etter onApplied-callbacken.
        }}
      />

      {toastProps && <Toast {...toastProps} />}
    </>
  );
}

// ---------- Helpers ----------

/**
 * Run-2-presisjon for sessionStorage-priser. Hindrer at JSON-serialisering
 * lekker IEEE-754-rundefluktuasjoner (f.eks. `1234.5600000000001`).
 */
function round2Money(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Mapper UI-skjema (`AddressForm`) til API-payload-shape.
 * `street` → `addressLine1`, `street2` → `addressLine2`. Resten matcher 1:1.
 * Server zod-schema validerer feltene strengere (postnummer-format osv.).
 */
function addressFormToApi(addr: AddressForm) {
  return {
    firstName: addr.firstName.trim(),
    lastName: addr.lastName.trim(),
    company: addr.company.trim(),
    addressLine1: addr.street.trim(),
    addressLine2: addr.street2.trim(),
    postalCode: addr.postalCode.trim(),
    city: addr.city.trim(),
    country: addr.country,
    phone: addr.phone.trim(),
  };
}

// ---------- Sub-komponenter ----------

// Paper 611-0: input radius 2, padding 11/14, border 1 sakai. Mobil var
// tidligere 16/16 + 1.5px border — leste som "tunge form-fields" framfor
// de kompakte input-feltene Paper viser.
const inputClass =
  'w-full rounded-1 border border-divider bg-surface px-3.5 py-2.5 text-body-sm text-ink placeholder:text-ink-muted focus:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2 md:py-sp-3';

function Section({
  title,
  helperText,
  children,
}: {
  title: string;
  /** Valgfri kort beskrivelse under tittelen (ny i 2026-05-flow). */
  helperText?: string;
  children: React.ReactNode;
}) {
  // Paper 60W-0/617-0/62B-0/62X-0/63B-0 (mobil): padding 20/16, gap 16,
  // border 1 sakai, radius 2. Tidligere `p-sp-5` (32) ga oppblåste kort.
  // Desktop beholder `p-sp-5` for komfortable felt-rader.
  return (
    <section className="flex flex-col gap-sp-3 rounded-1 border border-divider bg-surface px-4 py-5 md:gap-sp-4 md:p-sp-5" /* paper-exact: 60W-0 (mobile py 20 px 16, gap 16) */>
      <header className="flex flex-col gap-1">
        <span
          className="block font-bold uppercase text-ink-muted"
          style={{ fontSize: '11px', lineHeight: '14px', letterSpacing: '0.1em' }} /* paper-exact: 60X-0 (11/14 bold haiiro 0.1em) */
        >
          {title}
        </span>
        {helperText && (
          <p className="text-ink-muted" style={{ fontSize: '13px', lineHeight: '18px' }}>
            {helperText}
          </p>
        )}
      </header>
      <div className="flex flex-col gap-sp-3 md:gap-sp-4" /* paper-exact: 60Y-0 (mobile inner gap 16) */>{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  // Paper 60Z-0: gap 6 mellom label og input.
  // Paper 610-0/614-0/61M-0/61Z-0: label er Satoshi-Bold kuro
  // (NOT haiiro / NOT medium). Mobil bruker 12/16, desktop bumpes til
  // 13/16. NB: bruker Tailwind-klasser her, ikke inline style — inline
  // style har høyere specificitet enn `md:`-utility, så `md:text-[13px]`
  // ville aldri slått inn hvis fontSize sto i `style`.
  return (
    <label className="flex flex-col gap-1.5">
      <span
        className="block font-bold text-ink text-[12px] leading-4 md:text-[13px]" /* paper-exact: 610-0 (mobile 12/16, desktop 13/16 bold kuro) */
      >
        {label}
      </span>
      {children}
    </label>
  );
}

interface RadioOption {
  value: string;
  title: string;
  description?: string;
  meta?: string;
}

function RadioGroup({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: RadioOption[];
}) {
  // Paper 62E-0/62L-0/...: padding 12/14, gap 10, border 1 (ikke 1.5).
  // Aktiv-state: border-aka, bg #FF333305 (aka @ ~3%). Inactive: border-divider.
  return (
    <div className="flex flex-col gap-sp-2">
      {options.map((opt) => {
        const checked = opt.value === value;
        return (
          <label
            key={opt.value}
            className={[
              'flex cursor-pointer items-start gap-2.5 rounded-1 border px-3.5 py-3 transition-colors', /* paper-exact: 62E-0 (padding 12/14, gap 10, border 1) */
              checked
                ? 'border-aka bg-aka/[0.03]'
                : 'border-divider bg-surface hover:border-ink',
            ].join(' ')}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={checked}
              onChange={() => onChange(opt.value)}
              className="mt-0.5 size-4 cursor-pointer accent-aka" /* paper-exact: 62F-0 (16×16 radio circle) */
            />
            <div className="flex flex-1 min-w-0 flex-col gap-0.5" /* paper-exact: 62H-0 (col gap 2) */>
              <div className="flex items-baseline justify-between gap-sp-3">
                <span className="font-bold text-ink" style={{ fontSize: '13px', lineHeight: '16px' }} /* paper-exact: 62I-0 (13/16 bold) */>
                  {opt.title}
                </span>
                {opt.meta && (
                  <span
                    className={[
                      'font-bold',
                      opt.meta === 'Gratis' ? 'text-aka' : 'text-ink',
                    ].join(' ')}
                    style={{ fontSize: '12px', lineHeight: '16px' }} /* paper-exact: 62K-0 (12/16 bold) */
                  >
                    {opt.meta}
                  </span>
                )}
              </div>
              {opt.description && (
                <p className="text-ink-muted" style={{ fontSize: '12px', lineHeight: '16px' }} /* paper-exact: 62J-0 (12/16 regular haiiro) */>
                  {opt.description}
                </p>
              )}
            </div>
          </label>
        );
      })}
    </div>
  );
}

// ---------- Payment options (Kort + Gavekort) — Paper HF2-0/HFO-0 ----------

/**
 * PaymentOptions — Kort vs Gavekort radio-cards med rik visualisering.
 *
 * Paper HF2-0 (opt-kort): 18×18 radio + tittel "Betal med kort" + 5 card-
 * logoer (VISA, Mastercard, AMEX, Vipps, Klarna) i 36×22-pills under
 * tittelen.
 *
 * Paper HFO-0 (opt-gavekort): 18×18 radio + 14×14 gift-icon + tittel
 * "Gavekort" inline, og en beskrivelse "Løs inn gavekortkoden din ved
 * kassen." under.
 *
 * Aktiv-state: 1px aka-border + bg #FF333305 (aka @ 3% tint). Inaktiv:
 * 1px sakai border. Samme kort-pattern som Fraktvalg-radioer.
 */
function PaymentOptions({
  value,
  onChange,
}: {
  value: 'card' | 'gift-card';
  onChange: (v: 'card' | 'gift-card') => void;
}) {
  return (
    <div className="flex flex-col gap-sp-2">
      {/* opt-kort */}
      <label
        className={[
          'flex cursor-pointer items-start gap-2.5 rounded-1 border px-3.5 py-3 transition-colors', /* paper-exact: HF2-0 (padding 12/14, gap 10) */
          value === 'card'
            ? 'border-aka bg-aka/[0.03]'
            : 'border-divider bg-surface hover:border-ink',
        ].join(' ')}
      >
        <input
          type="radio"
          name="payment-method"
          value="card"
          checked={value === 'card'}
          onChange={() => onChange('card')}
          className="sr-only"
        />
        {/* Custom 18×18 radio-dot — matcher delivery-method (H0E-0). */}
        <span
          aria-hidden
          className={[
            'mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full border-2', /* paper-exact: HF3-0 / HFP-0 (18×18 radio dot) */
            value === 'card' ? 'border-aka' : 'border-divider',
          ].join(' ')}
        >
          {value === 'card' && <span className="size-2 rounded-full bg-aka" />}
        </span>
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="font-bold text-ink" style={{ fontSize: '13px', lineHeight: '16px' }} /* paper-exact: HF5-0 (Betal med kort title) */>
            Kort
          </span>
          <CardLogosRow />
        </span>
      </label>

      {/* opt-gavekort */}
      <label
        className={[
          'flex cursor-pointer items-start gap-2.5 rounded-1 border px-3.5 py-3 transition-colors',
          value === 'gift-card'
            ? 'border-aka bg-aka/[0.03]'
            : 'border-divider bg-surface hover:border-ink',
        ].join(' ')}
      >
        <input
          type="radio"
          name="payment-method"
          value="gift-card"
          checked={value === 'gift-card'}
          onChange={() => onChange('gift-card')}
          className="sr-only"
        />
        <span
          aria-hidden
          className={[
            'mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full border-2', /* paper-exact: HF3-0 / HFP-0 (18×18 radio dot) */
            value === 'gift-card' ? 'border-aka' : 'border-divider',
          ].join(' ')}
        >
          {value === 'gift-card' && <span className="size-2 rounded-full bg-aka" />}
        </span>
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-sp-2" /* paper-exact: HFR-0 (icon + title gap 8) */>
            <span aria-hidden className="text-ink">
              <GiftIcon />
            </span>
            <span className="font-bold text-ink" style={{ fontSize: '13px', lineHeight: '16px' }} /* paper-exact: HG0-0 (Gavekort title) */>
              Gavekort
            </span>
          </span>
          <span className="text-ink-muted" style={{ fontSize: '12px', lineHeight: '16px' }} /* paper-exact: HG1-0 (description haiiro) */>
            Løs inn gavekortkoden din ved kassen.
          </span>
        </span>
      </label>
    </div>
  );
}

/**
 * Rad med betalings-provider-logoer under "Kort"-tittelen.
 *
 * Logoene ligger som SVG-filer i /public/payment/ og lastes som vanlige img-
 * tags. Hver logo er normalisert til samme høyde (h-6 = 24 px) med w-auto
 * og objektsentrert i en bakgrunns-pille, slik at varierende aspect ratios
 * ikke gjør radet skjevt. Hvit bakgrunn på pillene sikrer lesbarhet i
 * dark-mode (logoene er typisk i farger som forutsetter lys bakgrunn).
 *
 * Rekkefølge speiler den Nexi viser inni iframen: Amex, Visa, Mastercard,
 * Maestro, Vipps, Klarna, Google Pay.
 */
function CardLogosRow() {
  const logos: ReadonlyArray<{ src: string; alt: string }> = [
    { src: '/payment/visa.svg', alt: 'Visa' },
    { src: '/payment/mastercard.svg', alt: 'Mastercard' },
    { src: '/payment/maestro.svg', alt: 'Maestro' },
    { src: '/payment/amex.svg', alt: 'American Express' },
    { src: '/payment/vipps.svg', alt: 'Vipps' },
    { src: '/payment/klarna.svg', alt: 'Klarna' },
    { src: '/payment/googlepay.svg', alt: 'Google Pay' },
  ];

  return (
    <span className="flex flex-wrap items-center gap-1.5" /* paper-exact: HF6-0 (logos row) */>
      {logos.map((logo) => (
        <span
          key={logo.src}
          className="flex h-6 w-9 items-center justify-center rounded-[2px] border border-[#E0E0DC] bg-white px-0.5" /* paper-exact: HF7-0 (36×24 logo-pille, 2px radius, sakai-border på hvit bg for konsistens i light/dark) */
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- statiske SVGer i /public, optimaliserer ikke via next/image */}
          <img
            src={logo.src}
            alt={logo.alt}
            className="block h-4 w-auto max-w-full object-contain"
            loading="lazy"
            decoding="async"
          />
        </span>
      ))}
    </span>
  );
}

function GiftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="1.5" y="5" width="11" height="7.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M0.5 5h13v2h-13z" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 4.5v8" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3.5 4.5C3 2.5 4.5 1.5 5.5 1.5C6.5 1.5 7 3 7 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M10.5 4.5C11 2.5 9.5 1.5 8.5 1.5C7.5 1.5 7 3 7 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

// ---------- Order summary (desktop sticky) ----------

interface OrderSummaryProps {
  items: ReturnType<typeof useCartItems>;
  shippingLabel: string;
  shippingCost: number;
  subtotalExVat: number;
  vat: number;
  savings: number;
  total: number;
  pending: boolean;
  /** Paper JT8-1: gavekort-payment-blokk vises etter Total når aktivert. */
  appliedGiftCard?: {
    code: string;
    validUntil: string;
    amount: number;
  } | null;
  onRemoveGiftCard?: () => void;
}

function OrderSummary({
  items,
  shippingLabel,
  shippingCost,
  subtotalExVat,
  vat,
  savings,
  total,
  pending,
  appliedGiftCard,
  onRemoveGiftCard,
}: OrderSummaryProps) {
  return (
    <div className="space-y-sp-5">
      <div className="flex flex-col gap-sp-4 rounded-1 border border-divider bg-surface p-sp-5">
        <span
          style={{ fontSize: 'var(--text-label)', letterSpacing: '0.12em' }}
          className="font-bold uppercase text-ink-muted"
        >
          Ordreoppsummering
        </span>

        <ul className="flex flex-col divide-y divide-divider">
          {items.map((item) => (
            <li key={item.key} className="flex items-start gap-sp-3 py-sp-4 first:pt-0">
              {/* Thumbnail */}
              <div className="size-16 shrink-0 overflow-hidden rounded-xs bg-surface-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {item.imageUrl && (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="size-full object-cover"
                  />
                )}
              </div>

              {/* Brand + navn + SKU + per-stk-pris */}
              <div className="flex-1 min-w-0">
                {item.brand && (
                  <span
                    style={{ fontSize: '11px', letterSpacing: '0.08em', lineHeight: '14px' }}
                    className="block font-bold uppercase text-ink-muted"
                  >
                    {item.brand}
                  </span>
                )}
                <p
                  className="mt-0.5 line-clamp-2 font-bold text-ink"
                  style={{ fontSize: '14px', lineHeight: '1.3' }}
                >
                  {item.name}
                </p>
                {item.sku && (
                  <p className="mt-0.5 text-body-xs text-ink-muted">
                    SKU: {item.sku}
                  </p>
                )}
                {/* Per-stk-pris med ordinær-strikethrough hvis salg. */}
                <div className="mt-1 flex items-baseline gap-1.5">
                  {item.regularPrice && item.regularPrice > item.unitPrice ? (
                    <>
                      <span className="font-bold text-aka" style={{ fontSize: '14px' }}>
                        {formatNok(item.unitPrice)}
                      </span>
                      <span className="text-body-xs text-ink-muted line-through">
                        {formatNok(item.regularPrice)}
                      </span>
                    </>
                  ) : (
                    <span className="font-bold text-ink" style={{ fontSize: '14px' }}>
                      {formatNok(item.unitPrice)}
                    </span>
                  )}
                  <span className="text-body-xs text-ink-muted">/ stk</span>
                </div>
              </div>

              {/* Høyre kolonne: Fjern + stepper + linje-sum */}
              <div className="flex shrink-0 flex-col items-end gap-sp-2">
                <button
                  type="button"
                  onClick={() => removeFromCart(item.key)}
                  className="text-body-xs text-aka hover:underline"
                  aria-label={`Fjern ${item.name} fra ordren`}
                >
                  Fjern
                </button>

                {/* Quantity-stepper — bruker delt `QuantityStepper`-komponent
                    så den er identisk med cart-siden (Paper 682-0: rounded-1
                    outer 1px sakai-border, 34×34 +/−, 36×34 qty middle med
                    sakai-side-borders, bold +/−). Tidligere var dette en
                    inline-versjon med rounded-xs og regular muted +/− —
                    konsistens med cart matcher Paper bedre. */}
                <QuantityStepper
                  value={item.quantity}
                  onChange={(next) => setQuantity(item.key, next)}
                  min={1}
                  productLabel={item.name}
                />

                {/* Linje-sum (eks mva primært, inkl mva sekundært).
                    Viser to tall som matcher Paper-mønsteret. */}
                <div className="text-right">
                  <p
                    className="font-bold tabular-nums text-ink"
                    style={{ fontSize: '14px', lineHeight: '18px' }}
                  >
                    {formatNok(item.unitPrice * item.quantity)}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <dl className="flex flex-col gap-sp-2 border-t border-divider pt-sp-4">
          <div className="flex items-baseline justify-between text-body-xs">
            <dt className="text-ink-muted">Delsum (eks. MVA)</dt>
            <dd className="font-bold tabular-nums text-ink">
              {formatNok(subtotalExVat)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between text-body-xs">
            <dt className="text-ink-muted">Frakt</dt>
            <dd
              className={[
                'font-bold tabular-nums',
                shippingCost === 0 ? 'text-aka' : 'text-ink',
              ].join(' ')}
            >
              {shippingCost === 0 ? 'Gratis' : formatNok(shippingCost)}
            </dd>
          </div>
          {savings > 0 && (
            <div className="flex items-baseline justify-between text-body-xs">
              <dt className="text-ink-muted">Du sparer</dt>
              <dd className="font-bold tabular-nums text-aka">−{formatNok(savings)}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between text-body-xs">
            <dt className="text-ink-muted">MVA (25%)</dt>
            <dd className="font-bold tabular-nums text-ink">{formatNok(vat)}</dd>
          </div>
        </dl>

        <div className="flex items-baseline justify-between border-t border-divider pt-sp-4">
          <span className="text-body-md font-bold text-ink">Total</span>
          <div className="text-right">
            <p className="text-h3 font-bold tabular-nums text-ink">
              {formatNok(total)}
            </p>
            <p className="text-body-xs text-ink-muted">inkludert MVA</p>
          </div>
        </div>

        {/* Rabattkode — Paper GON-0: pt 20, pb 4, gap 10, border-top sakai.
            Empty-state = input + Bruk-knapp. Applied-state = pill med kode +
            beskrivelse + fjern-X. MVP: validerer "VELG20" lokalt — bytt til
            API-kall når coupon-endpoint er klart. */}
        <DiscountCode />

        {/* Gavekort-payment — Paper JT8-1. Vises kun når et gavekort er
            aktivert. Inneholder "BETALINGSMETODE"-eyebrow + applied-pill med
            kode/saldo/beløp/fjern-X + "Gjenstående å betale"-rad. */}
        {appliedGiftCard && (() => {
          const remaining = Math.max(total - appliedGiftCard.amount, 0);
          return (
            <div className="flex flex-col gap-3 border-t border-divider pt-sp-4" /* paper-exact: JT8-1 (gavekort-payment block) */>
              <span
                className="font-bold uppercase text-ink-muted"
                style={{ fontSize: '11px', lineHeight: '14px', letterSpacing: '0.1em' }} /* paper-exact: JT9-1 (eyebrow) */
              >
                Betalingsmetode
              </span>
              {/* Applied-pill — Paper JTA-1 */}
              <div className="flex items-center gap-2.5 rounded-1 border border-divider bg-canvas px-3 py-2.5" /* paper-exact: JTA-1 (applied gavekort row) */>
                <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0 text-midori" aria-hidden>
                  <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" fill="none" />
                  <path d="M5 8L7 10L11 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-bold text-ink" style={{ fontSize: '13px', lineHeight: '16px' }} /* paper-exact: JTG-1 */>
                    {appliedGiftCard.code}
                  </span>
                  <span className="truncate text-ink-muted" style={{ fontSize: '12px', lineHeight: '14px' }} /* paper-exact: JTH-1 */>
                    Saldo: {formatNok(appliedGiftCard.amount)}
                  </span>
                </div>
                <span className="shrink-0 font-bold text-aka" style={{ fontSize: '13px', lineHeight: '16px' }} /* paper-exact: JTI-1 */>
                  −{formatNok(appliedGiftCard.amount)}
                </span>
                <button
                  type="button"
                  onClick={onRemoveGiftCard}
                  aria-label={`Fjern gavekort ${appliedGiftCard.code}`}
                  className="flex size-5 shrink-0 items-center justify-center text-ink-muted hover:text-ink" /* paper-exact: JTJ-1 (20×20 remove) */
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                    <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              {/* Gjenstående-rad — Paper JTO-1 */}
              <div className="flex items-baseline justify-between" /* paper-exact: JTO-1 */>
                <span className="font-bold text-ink" style={{ fontSize: '15px', lineHeight: '18px' }} /* paper-exact: JTP-1 */>
                  Gjenstående å betale
                </span>
                <div className="text-right">
                  <p className="font-bold tabular-nums text-ink" style={{ fontSize: '20px', lineHeight: '24px' }} /* paper-exact: JTR-1 */>
                    {formatNok(remaining)}
                  </p>
                  <p className="text-ink-muted" style={{ fontSize: '11px', lineHeight: '14px' }} /* paper-exact: JTS-1 */>
                    inkludert MVA
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        <button
          type="submit"
          disabled={pending}
          className="rounded-1 bg-aka px-sp-5 py-sp-4 text-body-md font-bold text-shiro transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {pending
            ? 'Behandler…'
            : appliedGiftCard
              ? `Betal ${formatNok(Math.max(total - appliedGiftCard.amount, 0))}`
              : 'Bekreft ordre'}
        </button>
        <p className="text-center text-body-xs text-ink-muted">
          Ved å fullføre kjøpet samtykker du til våre{' '}
          <Link href="/vilkar" className="underline hover:text-ink">
            Salgsbetingelser
          </Link>
          {' '}og vår{' '}
          <Link href="/personvernerklaering" className="underline hover:text-ink">
            Personvernerklæring
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

// ---------- Rabattkode (discount-code) — Paper GON-0 ----------

/**
 * DiscountCode — input + Bruk-knapp, eller applied-pill.
 *
 * Paper GON-0: pt 20, pb 4, gap 10, border-top sakai (sitter inne i totals
 * card etter Total-raden).
 *
 * MVP: validerer "VELG20" lokalt og viser applied-state. Bytt til API-kall
 * (POST /api/coupons/validate) når coupon-endpoint er klart. Selv om koden
 * applies, faller faktisk rabatt fra Woo — frontend gir bare visuell
 * bekreftelse på inntastet kode.
 */
function DiscountCode() {
  const [code, setCode] = useState('');
  const [appliedCode, setAppliedCode] = useState<{
    code: string;
    description: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleApply(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    // MVP-validering. Bytt til /api/coupons/validate-call når endpoint finnes.
    if (trimmed === 'VELG20') {
      setAppliedCode({ code: 'VELG20', description: '— 20% rabatt aktivert' });
      setError(null);
      setCode('');
    } else {
      setError('Ugyldig kode. Prøv igjen.');
    }
  }

  function handleRemove() {
    setAppliedCode(null);
    setError(null);
  }

  return (
    <div
      className="flex flex-col gap-2.5 border-t border-divider pt-5 pb-1" /* paper-exact: GON-0 (pt 20, pb 4, gap 10, border-top sakai) */
    >
      <span
        className="font-bold uppercase text-ink"
        style={{ fontSize: '11px', lineHeight: '14px', letterSpacing: '0.1em' }} /* paper-exact: GOO-0 (11/14 bold kuro 0.1em) */
      >
        Rabattkode
      </span>

      {appliedCode ? (
        <div
          className="flex items-center justify-between rounded-1 border border-divider bg-canvas px-3 py-2" /* paper-exact: GOU-0 (bg canvas, py 8 px 12) */
        >
          <span className="flex items-center gap-sp-2" /* paper-exact: GOV-0 (gap 8) */>
            <svg width="14" height="14" viewBox="0 0 14 14" className="text-aka shrink-0" aria-hidden>
              <path
                d="M3 7L6 10L11 4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
            <span
              className="font-bold text-ink"
              style={{ fontSize: '13px', lineHeight: '16px', letterSpacing: '0.05em' }} /* paper-exact: GP0-0 (13/16 bold 0.05em) */
            >
              {appliedCode.code}
            </span>
            <span
              className="text-ink-muted"
              style={{ fontSize: '13px', lineHeight: '16px' }} /* paper-exact: GP1-0 (13/16 regular haiiro) */
            >
              {appliedCode.description}
            </span>
          </span>
          <button
            type="button"
            onClick={handleRemove}
            aria-label={`Fjern rabattkode ${appliedCode.code}`}
            className="shrink-0 text-ink-muted transition-colors hover:text-ink" /* paper-exact: GP2-0 (remove X) */
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path
                d="M3 3L11 11M11 3L3 11"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-stretch gap-sp-2" /* paper-exact: GOP-0 (gap 8, stretch) */>
            <input
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                // Enter inside input shouldn't submit the parent form (which would
                // trigger Bekreft ordre). Apply discount-code locally instead.
                if (e.key === 'Enter') handleApply(e);
              }}
              placeholder="Skriv inn kode…"
              aria-label="Rabattkode"
              className="flex-1 rounded-1 border border-divider bg-surface px-3.5 py-2.5 text-body-sm text-ink placeholder:text-ink-muted focus:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2" /* paper-exact: GOQ-0 (radius 2, py 10 px 14, border 1) */
            />
            <button
              type="button"
              onClick={handleApply}
              className="flex shrink-0 items-center justify-center rounded-1 bg-surface-contrast px-4 py-2.5 font-bold text-ink-inverse transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2" /* paper-exact: GOS-0 (bg kuro, py 10 px 18) */
              style={{ fontSize: '13px', lineHeight: '16px' }} /* paper-exact: GOT-0 (13/16 bold shiro) */
            >
              Bruk
            </button>
          </div>
          {error && (
            <p className="text-aka" style={{ fontSize: '12px', lineHeight: '16px' }}>
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ---------- Mobile collapsed summary ----------

function MobileOrderSummary({
  items,
  total,
  subtotalExVat,
  shippingCost,
  savings,
  vat,
}: {
  items: ReturnType<typeof useCartItems>;
  total: number;
  subtotalExVat: number;
  shippingCost: number;
  savings: number;
  vat: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-1 border border-divider bg-surface">
      {/* Toggle row — Paper 5ZL-0: py 14 px 16, border-bottom når open. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={[
          'flex w-full items-center justify-between gap-sp-2 px-4 py-3.5 text-left' /* paper-exact: 5ZL-0 (py 14 px 16) */,
          open ? 'border-b border-divider' : '',
        ].join(' ')}
      >
        <span className="flex items-center gap-sp-2 font-bold text-ink" style={{ fontSize: '13px', lineHeight: '16px' }} /* paper-exact: 5ZQ-0 (13/16 bold) */>
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
            <rect x="3" y="3" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M5 7H13M5 10H13M5 13H10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          Ordreoppsummering
        </span>
        <span className="flex items-center gap-sp-2">
          <span className="font-bold text-ink" style={{ fontSize: '15px', lineHeight: '18px' }} /* paper-exact: 5ZS-0 (15/18 bold) */>
            {formatNok(total)}
          </span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            className={open ? 'rotate-180 transition-transform' : 'transition-transform'}
            aria-hidden
          >
            <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </span>
      </button>

      {open && (
        // Paper 5ZV-0/60E-0: items list py 12 px 16 gap 10, totals block py 12 px 16 gap 6
        <div className="flex flex-col gap-sp-2 px-4 py-3" /* paper-exact: 5ZV-0/60E-0 (py 12 px 16) */>
          <ul className="flex flex-col gap-2.5" /* paper-exact: 5ZV-0 (gap 10) */>
            {items.map((item) => (
              <li key={item.key} className="flex justify-between gap-sp-3 text-body-xs">
                <div className="flex-1 min-w-0">
                  {item.brand && (
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-ink-muted" /* paper-exact: 5ZX-0 (brand-label 10px) */>
                      {item.brand}
                    </span>
                  )}
                  <p className="font-bold text-ink line-clamp-2">{item.name}</p>
                  <p className="text-ink-muted">
                    {item.quantity} stk × {formatNok(item.unitPrice)}
                  </p>
                </div>
                <span className="font-bold text-ink shrink-0">
                  {formatNok(item.unitPrice * item.quantity)}
                </span>
              </li>
            ))}
          </ul>
          <dl className="flex flex-col gap-sp-1 border-t border-divider pt-sp-3 text-body-xs">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Delsum (eks. MVA)</dt>
              <dd className="font-bold tabular-nums text-ink">
                {formatNok(subtotalExVat)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Frakt</dt>
              <dd
                className={[
                  'font-bold tabular-nums',
                  shippingCost === 0 ? 'text-aka' : 'text-ink',
                ].join(' ')}
              >
                {shippingCost === 0 ? 'Gratis' : formatNok(shippingCost)}
              </dd>
            </div>
            {savings > 0 && (
              <div className="flex justify-between">
                <dt className="text-ink-muted">Du sparer</dt>
                <dd className="font-bold tabular-nums text-aka">−{formatNok(savings)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-ink-muted">MVA (25%)</dt>
              <dd className="font-bold tabular-nums text-ink">{formatNok(vat)}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
