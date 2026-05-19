/**
 * Copy + kontrakter for `/konto/logg-inn` og `/konto/registrer`.
 *
 * Paper-referanser:
 *   - ALR-1 (Login Desktop) + AQT-1 (Login Mobile)
 *   - ADX-1 (Register Desktop) — venstre-panel benefits-kolonnen deles mellom
 *     login + register.
 *
 * Hold all tekst her — komponenter importerer kun konstanter. Gjør det lett
 * å gi ut copy-endringer til Alexander uten å pirke i JSX.
 */

export interface AuthBenefit {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** Lucide-inspirert icon-key — mapes i AuthBenefits til inline SVG. */
  readonly icon:
    | 'package'
    | 'heart'
    | 'zap'
    | 'percent'
    | 'sparkles';
}

// ---------------------------------------------------------------------------
// Benefits-sidekolonne (samme innhold på login + register)
// ---------------------------------------------------------------------------

export const AUTH_BENEFITS_KICKER = 'Fordeler med konto';
export const AUTH_BENEFITS_TITLE = 'Alt på ett sted';
export const AUTH_BENEFITS_SUBTITLE =
  'Følg ordre, lagre favoritter og handle raskere neste gang.';

export const AUTH_BENEFITS: readonly AuthBenefit[] = [
  {
    id: 'orders',
    title: 'Ordrehistorikk',
    description: 'Se alle tidligere kjøp og fakturaer samlet.',
    icon: 'package',
  },
  {
    id: 'wishlist',
    title: 'Ønskeliste',
    description: 'Lagre favoritt-knivene til neste anledning.',
    icon: 'heart',
  },
  {
    id: 'checkout',
    title: 'Raskere checkout',
    description: 'Adresse og betaling er forhåndsutfylt.',
    icon: 'zap',
  },
  {
    id: 'discount',
    title: 'Mengderabatt automatisk',
    description: 'Medlemspriser på 3+ kniver legges på automatisk.',
    icon: 'percent',
  },
  {
    id: 'early',
    title: 'Tidlig tilgang',
    description: 'Nyheter og limited drops før alle andre.',
    icon: 'sparkles',
  },
] as const;

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

/**
 * Page-level metadata (title-tag, og:title, description). Disse brukes
 * i `<Metadata>` og påvirker SEO. UI-headeren i form-card bruker de
 * separate `LOGIN_HEADER_*`-konstantene nedenfor.
 */
export const LOGIN_TITLE = 'Logg inn';
export const LOGIN_SUBTITLE =
  'Logg inn for å fortsette der du slapp — raskere checkout, ordrehistorikk og fordeler.';

/**
 * Form-card-header (Paper ALR-1 / AQT-1):
 *   H2 "Velkommen tilbake"
 *   subtitle "Ingen konto? Registrer deg her" — der "Registrer deg her" er
 *   en lenke som switch-er til /konto/registrer.
 *
 * Splittet i prefix + link slik at vi kan rendre `<Link>` uten å slice
 * strings i komponent-koden.
 */
export const LOGIN_HEADER_TITLE = 'Velkommen tilbake';
export const LOGIN_HEADER_SUB_PREFIX = 'Ingen konto?';
export const LOGIN_HEADER_SUB_LINK = 'Registrer deg her';

export const LOGIN_EMAIL_LABEL = 'E-postadresse';
export const LOGIN_EMAIL_PLACEHOLDER = 'din@epost.no';
export const LOGIN_PASSWORD_LABEL = 'Passord';
export const LOGIN_PASSWORD_PLACEHOLDER = '••••••••';
export const LOGIN_SUBMIT_LABEL = 'Logg inn';
export const LOGIN_SUBMIT_PENDING_LABEL = 'Logger inn …';
export const LOGIN_FORGOT_PASSWORD_LABEL = 'Glemt passord?';
export const LOGIN_FORGOT_PASSWORD_HREF = '/konto/glemt-passord';
export const LOGIN_REMEMBER_LABEL = 'Husk meg på denne enheten';
export const LOGIN_REGISTER_HREF = '/konto/registrer';

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export const REGISTER_TITLE = 'Opprett konto';
export const REGISTER_SUBTITLE =
  'Opprett konto for raskere checkout, ordrehistorikk og medlemsfordeler.';

export const REGISTER_HEADER_TITLE = 'Opprett konto';
export const REGISTER_HEADER_SUB_PREFIX = 'Allerede kunde?';
export const REGISTER_HEADER_SUB_LINK = 'Logg inn her';

export const REGISTER_FIRSTNAME_LABEL = 'Fornavn';
export const REGISTER_LASTNAME_LABEL = 'Etternavn';
export const REGISTER_EMAIL_LABEL = 'E-postadresse';
export const REGISTER_EMAIL_PLACEHOLDER = 'din@epost.no';
export const REGISTER_PASSWORD_LABEL = 'Passord';
export const REGISTER_CONFIRM_PASSWORD_LABEL = 'Bekreft passord';
export const REGISTER_PASSWORD_HINT =
  'Minst 8 tegn — bruk bokstaver og tall for god sikkerhet.';
export const REGISTER_SUBMIT_LABEL = 'Opprett konto';
export const REGISTER_SUBMIT_PENDING_LABEL = 'Oppretter konto …';

export const REGISTER_CONSENT_PREFIX = 'Jeg godtar';
export const REGISTER_CONSENT_TERMS_LABEL = 'vilkår og betingelser';
export const REGISTER_CONSENT_AND = 'og';
export const REGISTER_CONSENT_PRIVACY_LABEL = 'personvernerklæringen';
export const REGISTER_CONSENT_TERMS_HREF = '/vilkar-og-personvern#vilkar';
export const REGISTER_CONSENT_PRIVACY_HREF = '/vilkar-og-personvern#personvern';

export const REGISTER_LOGIN_HREF = '/konto/logg-inn';

// ---------------------------------------------------------------------------
// Error messages — felles mellom login og register
// ---------------------------------------------------------------------------

export const AUTH_ERROR_GENERIC = 'Noe gikk galt. Prøv igjen om litt.';
export const AUTH_ERROR_NETWORK =
  'Kunne ikke koble til serveren. Sjekk nettverket og prøv igjen.';
export const AUTH_ERROR_RATE_LIMITED =
  'For mange forsøk. Prøv igjen om et minutt.';
export const AUTH_ERROR_INVALID_CREDENTIALS = 'Feil e-post eller passord.';

// Register-spesifikke
export const AUTH_ERROR_EMAIL_TAKEN =
  'Denne e-postadressen er allerede registrert. Prøv å logge inn i stedet.';
export const AUTH_ERROR_INVALID_EMAIL = 'Ugyldig e-postadresse.';
export const AUTH_ERROR_WEAK_PASSWORD =
  'Passordet er for svakt. Bruk minst 8 tegn og miks bokstaver og tall.';
export const AUTH_ERROR_PASSWORD_MISMATCH = 'Passordene stemmer ikke overens.';
export const AUTH_ERROR_TERMS_REQUIRED =
  'Du må godta vilkårene for å opprette konto.';

// ---------------------------------------------------------------------------
// Tabs — brukes i AuthFormCard for å switche mellom login og register
// ---------------------------------------------------------------------------

export type AuthTab = 'login' | 'register';

export const AUTH_TABS: readonly { id: AuthTab; label: string; href: string }[] = [
  { id: 'login', label: 'Logg inn', href: '/konto/logg-inn' },
  { id: 'register', label: 'Registrer deg', href: '/konto/registrer' },
] as const;
