# Blogg-sync — fra WordPress til Supabase

Spec for hvordan blogg-innhold synkes og rendres på den nye frontend'en.

## Kilden er WordPress, ikke WooCommerce

Først én avklaring: blogg-poster ligger i WordPress' egen `wp_posts`-tabell med `post_type = 'post'` — ikke i WooCommerce. WC bruker bare `wp_posts` med `post_type = 'product'`. Det er ulike dataset i samme database, eksponert via ulike REST-endepunkter:

- `/wp-json/wp/v2/posts` — bloggposter (vår kilde)
- `/wp-json/wc/v3/products` — produkter (det vi allerede synker)

Det betyr at vi bruker WP REST API (ikke WC REST), og at autentisering er en **Application Password** på en WP-admin-bruker — *ikke* `ck_/cs_`-keys (de virker bare mot WC-endpunktene).

## Speilingsmodellen er den samme

Samme arkitektur som for produkter (per ADR-0001):

```
WordPress (kilde)
  ↓ webhook (real-time) + cron (nattlig sikkerhetsnett)
Supabase (speil)
  ↓ Next.js leser
Frontend
```

Frontend kaller aldri WP REST direkte på request-tid. Vi har Redis-cache foran Supabase, og Supabase RLS gir public-read tilgang på alt blogg-innhold.

## Hva som speiles

Fire nye Supabase-tabeller:

### `blog_posts`
Speiler `wp_posts` der `post_type='post'` og `status='publish'`. Har vi behov for drafts/private senere, utvider vi.

| Kolonne | Type | Kommentar |
|---|---|---|
| `id` | bigint PK | WP post ID |
| `slug` | text unique | Stripped-down URL-slug |
| `title` | text | `title.rendered`, decoded |
| `excerpt` | text | `excerpt.rendered`, sanitized + stripped |
| `content` | text | `content.rendered`, sanitized HTML |
| `published_at` | timestamptz | WP `date_gmt` |
| `modified_at` | timestamptz | WP `modified_gmt` |
| `author_id` | bigint FK | → `blog_authors.id` |
| `featured_image` | jsonb | `{src, alt, width, height}` — resolvet fra media-id |
| `category_ids` | bigint[] | Array av `blog_categories.id` |
| `tag_ids` | bigint[] | Array av `blog_tags.id` |
| `reading_time_min` | int | Beregnet i mapper, ikke fra WP |
| `seo_title` | text | `yoast_head_json.title` |
| `seo_description` | text | `yoast_head_json.description` |
| `og_image_url` | text | Sosial-deling-bilde fra Yoast |
| `source_payload` | jsonb | Hele WP-respons-objektet — debug/migrasjon |
| `synced_at` | timestamptz | Når raden ble oppdatert sist |

### `blog_categories`
Speiler WP `category`-taxonomy. Felter: `id`, `slug`, `name`, `description`, `parent_id`, `count`, `synced_at`.

### `blog_tags`
Speiler WP `post_tag`-taxonomy. Felter: `id`, `slug`, `name`, `description`, `synced_at`.

### `blog_authors`
Speiler WP-brukere som har skrevet poster. Felter:

| Kolonne | Type | Kommentar |
|---|---|---|
| `id` | bigint PK | WP user ID |
| `slug` | text unique | f.eks. `alexander` |
| `name` | text | Visnings-navn |
| `description` | text | Bio (fra WP "biographical info"-feltet) |
| `avatar_url` | text | Gravatar-URL eller egen |
| `role` | text | `editor`/`author`/`contributor` (kun de som har publisert) |
| `synced_at` | timestamptz | |

E-E-A-T-detaljer (utgivelse, sertifiseringer) håndteres via custom user-meta i WP — samme mu-plugin-mønster som vi har på `product_brand` for `skn_brand_*`-feltene. Mer om det under "Forfatter-bio og E-E-A-T".

## Mapper

Ny fil `lib/wp/mappers.ts` (parallelt med `lib/woo/mappers.ts`) eier alle WP → Supabase-konverteringer:

```ts
export function mapPost(wp: WpPost, options: { authors: Map<number, ...> }): TablesInsert<'blog_posts'>
export function mapPostCategory(wp: WpCategory): TablesInsert<'blog_categories'>
export function mapPostTag(wp: WpTag): TablesInsert<'blog_tags'>
export function mapPostAuthor(wp: WpUser): TablesInsert<'blog_authors'>
```

### Spesifikke mapping-trinn

**HTML-håndtering.** WP returnerer rendered HTML i `content.rendered` med entiteter (`&amp;`), shortcodes (`[gallery]`, `[caption]`) og blocks. Mapper'en må:
1. Decode HTML-entiteter (vi har allerede `decodeHtmlEntities` i `lib/utils/html.ts`)
2. Sanitize for trygg `dangerouslySetInnerHTML` (allerede `sanitizeHtml`)
3. Normalize blokker som ikke fungerer headless (`[caption]` blir til ren tekst, etc.)

**Lesetid.** WP eksponerer ikke dette — vi beregner med en standard 200 ord/min:
```ts
const wordCount = stripHtml(content).split(/\s+/).filter(Boolean).length;
const readingTime = Math.max(1, Math.round(wordCount / 200));
```

**Featured image.** WP returnerer `featured_media` som ID — bildet selv ligger på `/wp/v2/media/<id>`. To strategier:

A) *Eager*: hent media-objektet og inline `{src, alt, width, height}` i mapper'en. Krever ekstra REST-kall per post — tregere.

B) *Embedded*: bruk `?_embed=wp:featuredmedia` på posts-endepunktet — WP inkluderer media-objektet i responsen. **Bruk B.**

**Forfatter.** Samme — `?_embed=author` gir hele user-objektet.

Eksempel-URL fra cron: `/wp/v2/posts?per_page=100&_embed=wp:featuredmedia,author,wp:term&_fields=id,slug,date_gmt,modified_gmt,title,content,excerpt,author,categories,tags,featured_media,yoast_head_json,_embedded`

`_fields` reduserer payload-størrelse med ~60 % — viktig på en cron som henter 200+ poster.

**Yoast SEO-data.** `yoast_head_json` er allerede på alle WP-objekter (vi bruker det også på products/categories). Mapper plukker:
- `title` → `seo_title`
- `description` → `seo_description`
- `og_image[0].url` → `og_image_url`

Fall tilbake til `title.rendered` og en stripped-down excerpt hvis Yoast-felt mangler.

## Cron-utvidelse

Bygg på det vi har — én cron-rute, mange `parts`. Legg til fire nye parts: `posts`, `blog_categories`, `blog_tags`, `blog_authors`.

```bash
# Synk alt blogg-innhold:
curl "$HOST?secret=$SECRET&parts=blog_authors,blog_categories,blog_tags,posts"

# Bare nye/oppdaterte poster (etter en redaksjonell endring):
curl "$HOST?secret=$SECRET&parts=posts"
```

**Rekkefølge betyr noe.** `posts` har FK til `blog_authors.id`. Forfattere må synkes først, ellers feiler upsert. Cron'en må håndhewe denne avhengigheten — enten ved å automatisk inkludere `blog_authors` når `posts` er valgt, eller ved at kall som spesifiserer bare `posts` får advarsel hvis forfattere mangler.

**Pagination.** WP REST returnerer maks 100 per side. Vi reuser `fetchAllPages`-helperen — bare bytt path og auth.

**Auth.** `lib/wp/client.ts` (ny fil parallelt med `lib/woo/client.ts`) bruker Application Password mot `/wp/v2/*`. Lagres i Vercel-env som:
- `WP_APP_USER` (typisk `admin`)
- `WP_APP_PASSWORD` (Application Password generert i WP-profil)

Vi har dette allerede via `WP_ADMIN_USERNAME` / `WP_ADMIN_APP_PASSWORD` i `.env.local`.

## Real-time updates via webhook

WP har ikke native webhooks for `post.*`-events, men plugin'en **WP Webhooks** (gratis) støtter alle vanlige events. Eller egen kort mu-plugin med `wp_after_insert_post`-hook som fyrer en POST mot `/api/webhooks/wp`.

```php
add_action('wp_after_insert_post', function($post_id, $post, $update) {
    if ($post->post_type !== 'post') return;
    if (wp_is_post_revision($post_id)) return;
    wp_remote_post('https://skarpekniver.com/api/webhooks/wp', [
        'body' => json_encode(['id' => $post_id, 'topic' => 'post.' . ($update ? 'updated' : 'created')]),
        'headers' => ['X-WP-Webhook-Signature' => hash_hmac('sha256', $post_id, WP_WEBHOOK_SECRET)],
        'timeout' => 5,
    ]);
}, 10, 3);
```

Frontend webhook-handler (`app/api/webhooks/wp/route.ts`) verifiserer HMAC, henter posten på nytt fra WP REST, mapper, upserter. Samme mønster som `/api/webhooks/woo/route.ts`.

For første lansering kan vi droppe webhook og bare lene oss på den daglige cron'en — blogginnhold endrer seg sjelden, og 24t-forsinkelse er akseptabelt.

## Frontend-routing

```
/blogg                       Overview (Paper "Blogg — Kategori")
/blogg/[slug]                Article (Paper "Blogg — Artikkel")
/blogg/kategori/[slug]       Filtered overview per kategori
/blogg/forfatter/[slug]      Forfatter-arkiv (E-E-A-T-side)
```

`/blogg/[slug]` resolveres mot `blog_posts.slug`. Hvis WP-URL'en var `/blogg/<slug>` (eller `/blog/<slug>`), må vi 301-redirecte gamle URL-er via `next.config.js` redirects til den nye stien.

## Forfatter-bio og E-E-A-T

Google rangerer kunnskaps-innhold etter forfatterens dokumenterte kompetanse i emnet (E-E-A-T: Experience, Expertise, Authoritativeness, Trustworthiness). For en kniv-spesialistbutikk er det relevant.

Hver forfatter bør ha:
- Avatar (fra Gravatar eller egen upload)
- Visnings-navn (for byline)
- Bio på 2–4 setninger ("X år som kokk, Y år hos Skarpekniver, brent 12 omeletter før jeg fant riktig stekepanne")
- Lenker til relevante sosiale (Instagram, LinkedIn, evt. egen blog)
- Sertifiseringer / utdannelse hvis relevant

WP eksponerer kun `name`, `slug` og `description` (bio) by default. For resten registrerer vi user-meta via mu-plugin (samme mønster som brand-meta):

```php
register_rest_field('user', 'meta_data', [
  'get_callback' => function($user) {
    return [
      ['key' => 'skn_author_role', 'value' => get_user_meta($user['id'], 'skn_author_role', true)],
      ['key' => 'skn_author_instagram', 'value' => ...],
      ['key' => 'skn_author_credentials', 'value' => ...],
    ];
  },
]);
```

Mapper plukker disse inn i `blog_authors`-raden.

På `/blogg/forfatter/[slug]`-siden vises:
- H1 + avatar + bio
- Liste over alle artikler forfatteren har publisert
- Schema.org `Person` med `description`, `url`, `sameAs`, `jobTitle`, `worksFor: { @type: Organization, name: 'Skarpekniver' }`

## Schema.org strukturert data

På hver artikkel:

```jsonld
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "...",
  "image": "...",
  "datePublished": "...",
  "dateModified": "...",
  "author": {
    "@type": "Person",
    "name": "...",
    "url": "https://skarpekniver.com/blogg/forfatter/<slug>"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Skarpekniver",
    "logo": { "@type": "ImageObject", "url": "..." }
  },
  "mainEntityOfPage": "https://skarpekniver.com/blogg/<slug>"
}
```

På oversikten:
- `BreadcrumbList` (Hjem → Blogg)
- `Blog`-type på sidenivå
- `ItemList` med `itemListElement`-array av kort-mini-objekter

## Cache-strategi

Samme som produkter — Redis foran Supabase, lengre TTL på blogg fordi innhold endres sjeldnere:
- `cachedPostBySlug(slug)` — TTL 1 time
- `cachedPostsByCategory(slug, page)` — TTL 30 min
- Cache invalideres fra webhook + cron (samme som vi gjør for produkter nå)

## Bilder

Featured images og inline-bilder i `content.rendered` peker mot `wp-content/uploads/...` på WP-serveren. To valg:

A) *La det stå.* Bruker WP-CDN. Enkleste vei — ingen migrering. Ulempe: Next.js' `<Image>`-komponent får ikke optimisert dem, og hvis dere senere migrerer wp.skarpekniver.no, brytes alle linker.

B) *Migrer bilder til vår CDN* (Bunny/R2 — TBD per CLAUDE.md åpent spørsmål 6). Mapper'en laster ned + uploader hver gang vi ser et nytt bilde. Mer arbeid, men gir bedre kontroll.

Anbefaling: start med A. Migrer senere hvis WP-domenet skal saneres.

## Implementerings-faser

1. **Fase 1 — Sync og overview-side** (~ 1–2 dager)
   - Migrasjon for de 4 tabellene
   - `lib/wp/client.ts` med App Password-auth
   - `lib/wp/mappers.ts` med alle 4 mappers
   - Cron-utvidelse: `posts`/`blog_categories`/`blog_tags`/`blog_authors` parts
   - Førstegangs-backfill via `parts=blog_authors,blog_categories,blog_tags,posts`
   - `app/blogg/page.tsx` — overview matchende Paper "Blogg — Kategori"
   - `app/blogg/[slug]/page.tsx` — artikkelside matchende Paper "Blogg — Artikkel"

2. **Fase 2 — E-E-A-T og kategorier** (~ 2 dager)
   - mu-plugin for `skn_author_*`-meta
   - `app/blogg/forfatter/[slug]/page.tsx`
   - `app/blogg/kategori/[slug]/page.tsx`
   - Schema.org BlogPosting + Person på alle relevante sider

3. **Fase 3 — Webhooks og 301s** (~ 1 dag)
   - WP mu-plugin for `wp_after_insert_post`-webhook
   - `app/api/webhooks/wp/route.ts`
   - Mapping av gamle WP-URL-er til nye via `next.config.js` redirects

4. **Fase 4 — Søk i blogg, nyhetsbrev, related-artikler** (når trafikk-volum krever det)

## Hva vi *ikke* trenger å bygge

- Egen blogg-CMS. WP er fortsatt redaksjonelt UI — redaktører jobber der.
- Egen kommentar-løsning. Hvis dere vil ha kommentarer, bruk Disqus-embed eller la WP holde dem (lite trafikk forventet uansett).
- Live-preview. WP har det innebygd; redaktører ser preview i WP-admin før publish.

## Forutsetninger

- Det finnes en WP-admin-bruker med Application Password som har `read_posts`-capability minimum.
- WP REST er ikke disabled (sjekk `/wp-json` returnerer data).
- Hvis WP er bak en CDN/cache, må redaktøren purge cache etter publish — ellers henter cron'en gamle data.
