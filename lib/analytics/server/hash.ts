import 'server-only';

/**
 * PII-hashing for CAPI / Events API / Measurement Protocol.
 *
 * Meta CAPI, TikTok Events API og GA4 MP tar alle SHA-256 av normaliserte
 * felter (lowercased, trimmed). Denne modulen samler reglene på ett sted så
 * vi aldri sender uhashet PII til tredjepart.
 *
 * Kilder:
 *   - Meta: https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
 *   - TikTok: https://business-api.tiktok.com/portal/docs?id=1771101168141313
 *   - GA4 MP: https://developers.google.com/analytics/devguides/collection/protocol/ga4/user-properties
 */

import { createHash } from 'node:crypto';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Normalisér og hash en email. Lowercase + trim er industri-standard.
 * Returnerer undefined hvis input er tomt/ugyldig.
 */
export function hashEmail(email: string | null | undefined): string | undefined {
  if (!email) return undefined;
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes('@')) return undefined;
  return sha256Hex(normalized);
}

/**
 * Hash et telefonnummer. Meta forventer E.164-format uten `+`, space eller
 * separatorer (f.eks. `4798765432`). Vi stripper alt som ikke er tall.
 */
export function hashPhone(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return undefined;
  return sha256Hex(digits);
}

/** Hash fornavn/etternavn: lowercase + trim. */
export function hashName(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  const normalized = name.trim().toLowerCase();
  if (!normalized) return undefined;
  return sha256Hex(normalized);
}

/**
 * IP-adresser sendes normalt i klartekst til Meta (som behandler dem som
 * PII og hasher selv). Helperen her er kun for normalisering (strip port,
 * håndter IPv6-brackets).
 */
export function normalizeIp(
  ip: string | null | undefined,
): string | undefined {
  if (!ip) return undefined;
  // X-Forwarded-For kan være "client, proxy1, proxy2" — ta første.
  const first = ip.split(',')[0]?.trim();
  if (!first) return undefined;
  // Strip port: "1.2.3.4:56789" → "1.2.3.4". IPv6 "[::1]:port" → "::1".
  return first.replace(/^\[|\]:\d+$|:\d+$/g, '').trim();
}
