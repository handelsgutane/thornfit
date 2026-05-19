# 0003 — Kundekontoer i WooCommerce (ikke Supabase Auth)

**Status:** Godtatt
**Dato:** 2026-04-22
**Besluttet av:** Alexander + Claude

## Kontekst

Nye kunder må kunne lage konto, logge inn, se ordrehistorikk, ha ønskeliste og adresser. Tre alternativer:

1. **Supabase Auth + speile til Woo ved ordre.**
   - Moderne auth-UX (magic links, OAuth). Men: dobbel identitet, sync-kompleksitet, eksisterende Woo-kunder må migreres.
2. **WooCommerce som auth-kilde via JWT REST plugin (valgt).**
   - Eksisterende kunder fungerer uendret. Ordrehistorikk og wishlist kobles naturlig.
3. **Clerk/Auth0/Workos.**
   - Ekstra kostnad, ekstra tredjepart, samme sync-problem som Supabase Auth mot Woo.

## Beslutning

WooCommerce er identitets-kilde. Vi bruker `JWT Authentication for WP REST API`-pluginen (eller tilsvarende) for å autentisere kunder. Tokens settes som HTTP-only cookie på vår domene via server-proxy-endpoints i Next.js.

Flyt:

- Registrering: klient → `POST /api/auth/register` → Woo REST `POST /wc/v3/customers` → JWT-token → sett cookie.
- Innlogging: klient → `POST /api/auth/login` → Woo JWT-endpoint → sett cookie.
- Profil / ordrehistorikk / ønskeliste: klient → `/api/user/*` → Woo REST med JWT → returner JSON.

Se `business-logic.md` > "Kundekontoer" og `integrations.md` > "WooCommerce JWT".

## Konsekvenser

### Positive

- Eksisterende kunder i Woo fungerer uten migrering.
- Ordrehistorikk, wishlist, adresser er naturlig koblet til kunde-recorden Woo eier.
- Reduksjon i systemkompleksitet: én identitets-kilde.

### Negative / trade-offs

- Auth-UX er begrenset av hva Woo/JWT-pluginen støtter. Ikke trivielt å legge til magic links eller OAuth senere.
- Alle auth-endpoints går mot WordPress — treghet her slår rett på login-opplevelsen.
- Vi stoler på en WP-plugin for en kritisk flyt. Må følge med på plugin-vedlikehold og sårbarheter.
- Passord-glemt-flyt går via WordPress e-post. UX er ikke helt under vår kontroll.

### Hvordan revidere

Vi revurderer hvis:

- JWT-pluginen slutter å vedlikeholdes.
- Auth-flyt-ytelse blir en nøkkel-smertepunkt i produksjon.
- Vi må støtte enterprise-features (SSO, SAML) for B2B — vurder da å flytte auth til Clerk/Workos og la Woo kun eie order-record.
