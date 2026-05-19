/**
 * WooCommerce customer-klient — oppretter kunder via WCs REST v3.
 *
 * Brukt av `/api/auth/register` for å opprette en ny konto. Etter at
 * kunden er opprettet gjør samme route en auto-login via `wooLogin()` med
 * samme credentials slik at brukeren lander logget inn på /konto.
 *
 * Viktige detaljer:
 *   - WC REST krever consumer key + secret (basic auth) — håndteres av
 *     `wooFetch`, så vi bare POST-er hit.
 *   - WC sjekker IKKE passord-styrke på server — det er opp til oss. Vi
 *     validerer derfor i route-handleren (zod min(8)).
 *   - Ved duplikat e-post svarer WC 400 med `code: 'registration-error-email-exists'`
 *     (evt. `rest_invalid_email`). Vi mapper det til `email_taken` så
 *     route-handleren kan returnere AUTH_ERROR_EMAIL_TAKEN til klienten.
 *   - WC lager et `username` automatisk hvis vi ikke sender et. Vi sender
 *     e-posten som `username` for å unngå kollisjoner (WP tillater
 *     e-post som brukernavn). Hvis vi lar WC autogenerere får vi navn
 *     som "alex123" som ikke betyr noe for brukeren.
 *
 * Server-only. Importer aldri fra klient-komponenter.
 */

import 'server-only';

import { logger, serializeError } from '@/lib/logger';
import { wooFetch, WooError } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Kategoriserte feil-koder. API-routen mapper disse til norske feilmeldinger
 * — klienten ser aldri den rå WC-statusen.
 */
export type WooCustomerErrorCode =
  | 'email_taken'       // E-post allerede registrert
  | 'invalid_email'     // WC avviste e-post-formatet
  | 'weak_password'     // WC avviste passordet (sjelden — vi sjekker først)
  | 'not_found'         // WC kunne ikke finne kunden (404)
  | 'rate_limited'      // 429 fra WC
  | 'network_error'     // Kunne ikke nå WC
  | 'unknown';          // 5xx eller uventet response-shape

export class WooCustomerError extends Error {
  readonly status: number;
  readonly code: WooCustomerErrorCode;
  readonly details: unknown;

  constructor(
    message: string,
    code: WooCustomerErrorCode,
    status: number,
    details: unknown = null,
  ) {
    super(message);
    this.name = 'WooCustomerError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export interface WooNewCustomer {
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly password: string;
}

/**
 * Subset av WC customer-response. Vi bruker kun id + email — resten av
 * kunde-profilen leses senere via `wooMe()` / chef-auth hvis relevant.
 */
export interface WooCustomerCreated {
  readonly id: number;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
}

interface WcAddressRaw {
  readonly first_name?: string;
  readonly last_name?: string;
  readonly company?: string;
  readonly address_1?: string;
  readonly address_2?: string;
  readonly city?: string;
  readonly state?: string;
  readonly postcode?: string;
  readonly country?: string;
  readonly phone?: string;
  readonly email?: string;
}

interface WcCustomerResponse {
  readonly id?: number;
  readonly email?: string;
  readonly first_name?: string;
  readonly last_name?: string;
  readonly billing?: WcAddressRaw;
  readonly shipping?: WcAddressRaw;
}

// ---------------------------------------------------------------------------
// Address types (used by AddressesView)
// ---------------------------------------------------------------------------

export interface WooAddress {
  readonly firstName: string;
  readonly lastName: string;
  readonly company: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly city: string;
  readonly postcode: string;
  readonly country: string;
  readonly phone: string;
  readonly email: string; // billing only
}

export interface WooAddressUpdate {
  readonly type: 'billing' | 'shipping';
  readonly address: WooAddress;
}

/**
 * Felter en innlogget bruker kan endre på sin egen kunde-record. Alle felt
 * er valgfrie — kun de som er definert sendes til WC. `password` settes kun
 * av password-flyten i `/api/auth/password`, ikke av profile-flyten.
 */
export interface WooCustomerUpdate {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly password?: string;
}

export interface WooCustomerUpdated {
  readonly id: number;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string;
}

interface WcErrorBody {
  readonly code?: string;
  readonly message?: string;
  readonly data?: { readonly status?: number };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Opprett en ny kunde i WooCommerce.
 *
 * Kaster `WooCustomerError` ved feil. Ved suksess returneres {id, email,
 * firstName, lastName} som route-handleren kan bruke til å logge bruker-ID.
 */
export async function wooCreateCustomer(
  input: WooNewCustomer,
): Promise<WooCustomerCreated> {
  try {
    const raw = await wooFetch<WcCustomerResponse>('/wc/v3/customers', {
      method: 'POST',
      body: {
        // E-post som username unngår kollisjoner og gir brukeren noe
        // gjenkjennelig i WP-admin.
        username: input.email,
        email: input.email,
        first_name: input.firstName,
        last_name: input.lastName,
        password: input.password,
      },
    });

    if (
      typeof raw?.id !== 'number' ||
      typeof raw?.email !== 'string'
    ) {
      logger.error('wc customers POST success with malformed body', {
        email: maskEmail(input.email),
      });
      throw new WooCustomerError(
        'Malformed customer response',
        'unknown',
        502,
        raw,
      );
    }

    return {
      id: raw.id,
      email: raw.email,
      firstName: raw.first_name ?? input.firstName,
      lastName: raw.last_name ?? input.lastName,
    };
  } catch (err) {
    if (err instanceof WooCustomerError) throw err;

    if (err instanceof WooError) {
      const code = mapErrorCode(err.status, err.body);
      logger.warn('wc customers POST failed', {
        email: maskEmail(input.email),
        status: err.status,
        wcCode: isErrorBody(err.body) ? err.body.code ?? null : null,
        mappedCode: code,
      });
      throw new WooCustomerError(
        `Customer create failed (${err.status})`,
        code,
        err.status,
        err.body,
      );
    }

    // Network-error — wooFetch retryer allerede for transient 5xx, så dette
    // er etter de forsøkene gikk tomme.
    logger.error('wc customers POST network error', {
      email: maskEmail(input.email),
      ...serializeError(err),
    });
    throw new WooCustomerError(
      'Network error reaching WooCommerce',
      'network_error',
      0,
      null,
    );
  }
}

/**
 * Oppdater en eksisterende kunde i WooCommerce.
 *
 * Sender kun feltene som er satt i `update`. WC tolker manglende felt som
 * "ikke endre" — vi sender derfor f.eks. ikke `first_name: ""` for å
 * "blanke ut" et felt; det må være eksplisitt fra konsumenten.
 *
 * Sikkerhet: rute-handleren MÅ verifisere at innlogget bruker eier
 * `customerId` før dette kalles. WC REST kjører med admin-credentials og
 * tar derfor ingen bruker-scoping på sin side.
 *
 * Kaster `WooCustomerError` ved feil.
 */
export async function wooUpdateCustomer(
  customerId: number,
  update: WooCustomerUpdate,
): Promise<WooCustomerUpdated> {
  if (!Number.isFinite(customerId) || customerId <= 0) {
    throw new WooCustomerError(
      'Invalid customer id',
      'not_found',
      400,
      null,
    );
  }

  // Bygg WC-payload defensivt — kun feltene som faktisk er satt.
  const body: Record<string, unknown> = {};
  if (update.firstName !== undefined) body.first_name = update.firstName;
  if (update.lastName !== undefined) body.last_name = update.lastName;
  if (update.email !== undefined) body.email = update.email;
  if (update.password !== undefined) body.password = update.password;
  // Telefon er ikke et top-level felt på WC customer — det bor under billing.
  // Vi merger med eksisterende billing-objekt ved å sende kun phone-keyen;
  // WC bevarer øvrige billing-felt automatisk på en partial update.
  if (update.phone !== undefined) {
    body.billing = { phone: update.phone };
  }

  if (Object.keys(body).length === 0) {
    throw new WooCustomerError(
      'No fields to update',
      'unknown',
      400,
      null,
    );
  }

  try {
    const raw = await wooFetch<WcCustomerResponse>(
      `/wc/v3/customers/${customerId}`,
      {
        method: 'PUT',
        body,
      },
    );

    if (
      typeof raw?.id !== 'number' ||
      typeof raw?.email !== 'string'
    ) {
      logger.error('wc customers PUT success with malformed body', {
        customerId,
      });
      throw new WooCustomerError(
        'Malformed customer response',
        'unknown',
        502,
        raw,
      );
    }

    return {
      id: raw.id,
      email: raw.email,
      firstName: raw.first_name ?? '',
      lastName: raw.last_name ?? '',
      phone: raw.billing?.phone ?? '',
    };
  } catch (err) {
    if (err instanceof WooCustomerError) throw err;

    if (err instanceof WooError) {
      const code = mapErrorCode(err.status, err.body);
      logger.warn('wc customers PUT failed', {
        customerId,
        status: err.status,
        wcCode: isErrorBody(err.body) ? err.body.code ?? null : null,
        mappedCode: code,
      });
      throw new WooCustomerError(
        `Customer update failed (${err.status})`,
        code,
        err.status,
        err.body,
      );
    }

    logger.error('wc customers PUT network error', {
      customerId,
      ...serializeError(err),
    });
    throw new WooCustomerError(
      'Network error reaching WooCommerce',
      'network_error',
      0,
      null,
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapErrorCode(status: number, raw: unknown): WooCustomerErrorCode {
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';

  if (isErrorBody(raw)) {
    const code = (raw.code ?? '').toLowerCase();
    const msg = (raw.message ?? '').toLowerCase();

    // WC har flere varianter av "e-post finnes fra før". Nyere versjoner
    // bruker `registration-error-email-exists`; eldre brukte bare `exists`
    // eller `woocommerce_rest_customer_exists`. Vi matcher bredt.
    if (
      code.includes('email-exists') ||
      code.includes('email_exists') ||
      code === 'woocommerce_rest_customer_exists' ||
      msg.includes('already registered') ||
      msg.includes('allerede registrert')
    ) {
      return 'email_taken';
    }

    if (
      code.includes('invalid_email') ||
      code.includes('rest_invalid_email') ||
      msg.includes('invalid email')
    ) {
      return 'invalid_email';
    }

    if (
      code.includes('invalid_password') ||
      code.includes('weak_password') ||
      msg.includes('weak password')
    ) {
      return 'weak_password';
    }
  }

  if (status >= 500) return 'unknown';
  return 'unknown';
}

function isErrorBody(raw: unknown): raw is WcErrorBody {
  if (!raw || typeof raw !== 'object') return false;
  return 'code' in raw || 'message' in raw;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const head = local?.slice(0, 2) ?? '';
  return `${head}***@${domain}`;
}

// ---------------------------------------------------------------------------
// Address operations
// ---------------------------------------------------------------------------

function mapRawAddress(raw: WcAddressRaw | undefined): WooAddress {
  return {
    firstName:   raw?.first_name  ?? '',
    lastName:    raw?.last_name   ?? '',
    company:     raw?.company     ?? '',
    addressLine1: raw?.address_1  ?? '',
    addressLine2: raw?.address_2  ?? '',
    city:        raw?.city        ?? '',
    postcode:    raw?.postcode    ?? '',
    country:     raw?.country     ?? 'NO',
    phone:       raw?.phone       ?? '',
    email:       raw?.email       ?? '',
  };
}

/**
 * Hent fakturerings- og leveringsadresse for en kunde fra WooCommerce.
 * Kalles server-side via API-route eller server component.
 */
export async function wooFetchCustomerAddresses(
  customerId: number,
): Promise<{ billing: WooAddress; shipping: WooAddress }> {
  const raw = await wooFetch<WcCustomerResponse>(
    `/wc/v3/customers/${customerId}`,
    { cache: 'no-store' },
  );

  return {
    billing:  mapRawAddress(raw.billing),
    shipping: mapRawAddress(raw.shipping),
  };
}

/**
 * Oppdater billing eller shipping adresse for en kunde.
 * Sikkerhet: API-routen MÅ verifisere at innlogget bruker eier customerId.
 */
export async function wooUpdateAddress(
  customerId: number,
  { type, address }: WooAddressUpdate,
): Promise<void> {
  const wcAddress: Record<string, string> = {
    first_name: address.firstName,
    last_name:  address.lastName,
    company:    address.company,
    address_1:  address.addressLine1,
    address_2:  address.addressLine2,
    city:       address.city,
    postcode:   address.postcode,
    country:    address.country,
    phone:      address.phone,
  };
  if (type === 'billing') wcAddress.email = address.email;

  await wooFetch(`/wc/v3/customers/${customerId}`, {
    method: 'PUT',
    body: { [type]: wcAddress },
  });
}
