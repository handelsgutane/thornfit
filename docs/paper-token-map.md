# Paper-token-map — faktiske computed styles → Tailwind-utility

**Formål:** Forhindre gjettende implementering. Hver gang du skal skrive en
radius/padding/border/height/farge-utility for en komponent som finnes i Paper,
slå opp her **først**. Ikke kopier fra hukommelse, ikke kopier fra et annet
artboard, ikke kopier fra et annet repo.

**Kilder:** Verdiene i denne fila er hentet direkte fra Paper MCP
`get_computed_styles` på de oppgitte node-ID-ene. Datoer i parentes angir
sist verifisert.

**Bruk:** Finn artboardet du jobber med. Bruk `node-ID`-en til å verifisere selv
før implementering hvis du er i tvil — kjør `get_computed_styles({ nodeIds: [...] })`
i Paper MCP og sammenlign.

> **Token-footgun:** I `app/globals.css` er `--radius-1: 2px`, `--radius-2: 4px`,
> `--radius-3: 8px`, `--radius-4: 12px`. Det vil si at `rounded-2` = **4px**,
> ikke 2px. Hvis Paper sier `borderRadius: 2px` skal det bli `rounded-1`.

---

## 1. Design-system reference (artboard `75-0` — Components — Buttons & Inputs)

Disse er **kanoniske** for hele systemet. Hvis et annet artboard avviker er det
enten en kontekst-spesifikk override (f.eks. Profile-area bruker 38px-CTAer i
stedet for 44px) eller en Paper-inkonsistens.

### Buttons (alle 2px radius — `rounded-1`)

| Variant | Node | Height | px | bg / border | Tailwind |
|---|---|---|---|---|---|
| `btn-primary-lg` | `7D-0` | 52px | 32px | `bg-aka` | `h-(--height-auth-cta) px-sp-5 rounded-1 bg-aka` |
| `btn-primary` | `7F-0` | 44px | 24px | `bg-aka` | `h-11 px-sp-4 rounded-1 bg-aka` |
| `btn-primary-sm` | `7H-0` | 34px | 16px | `bg-aka` | `h-9 px-sp-3 rounded-1 bg-aka` (Button-primitive `size="sm"`) |
| `btn-secondary` | `7K-0` | 44px | 24px | 1px solid `#1A1A1A` (ink) | `h-11 px-sp-4 rounded-1 border border-ink` |
| `btn-ghost` | `7M-0` | 44px | 24px | ingen | `h-11 px-sp-4 rounded-1` |
| `btn-disabled` | `7P-0` | 44px | 24px | `bg-sakai` (#E0E0DC) | `disabled:bg-divider` |

### Inputs (alle 2px radius — `rounded-1`, alle 44px h)

| State | Node | h | px | border | Tailwind |
|---|---|---|---|---|---|
| Default | `8B-0` | 44px | 16px | 1px `#E0E0DC` (divider) | `h-11 rounded-1 px-sp-3 border border-divider` |
| Filled / Focus | `8G-0` | 44px | 16px | 1px `#1A1A1A` (ink) | `focus:border-ink` |
| Error | `8L-0` | 44px | 16px | 1px `#FF3333` (aka) | `aria-invalid:border-aka` |
| Search (gap 10) | `8Q-0` | 44px | 16px | 1px `#E0E0DC` | `h-11 rounded-1 px-sp-3 gap-2.5 border border-divider` |

> **Merk om input-padding:** Paper bruker 14px paddingInline i Profile-area
> (`6V4-0`) men 16px i 75-0 reference. `sp-3` = 16px er nærmest, og forskjellen
> på 2px er ikke synlig — bruk `px-sp-3` overalt.

---

## 2. Auth (artboards `ALR-1`, `ADX-1`, `AQT-1`)

**Verifisert: 2026-04-25.**

### Form-card (`ATM-1` login / `AUS-1` register)

```
borderRadius:  4px        → rounded-2
paddingBlock:  48px       → py-12 (eller --padding-auth-card-y = 48)
paddingInline: 44px       → px-11 (eller --padding-auth-card-x = 44)
border:        1px solid #E0E0DC  → border border-divider
bg:            #FFFFFF             → bg-surface
```

NB: Form-card har **4px radius** — i motsetning til Profile-area-cards (se §3)
som bruker 2px desktop. Form-card overlever som 4px fordi den er "destination",
mens Profile-area-cards er innholds-grupper i et større layout.

### Inputs i form-card (`ATX-1`, `AVC-1`, `AVG-1`, `AVN-1`)

```
borderRadius:  2px               → rounded-1
height:        ~44–48px          → h-(--height-auth-input)  /* 48px token */
paddingInline: 14px              → px-sp-3 (16px — close enough)
border:        1px solid #E0E0DC → border border-divider
                1.5px solid #1A1A1A når focus  → focus:border-ink
```

### Primary CTA (`AUB-1` login, `AVX-1` register)

```
borderRadius:  2px       → rounded-1
height:        52px      → h-(--height-auth-cta)
paddingInline: 16px (full-bredde, så irrelevant)
bg:            #FF3333   → bg-aka
```

---

## 3. Profile-area desktop (artboard `6GP-0` — Personlig informasjon)

**Verifisert: 2026-04-25.**

### Cards (`6UZ-0` Personalia, `6VR-0` Passord)

```
borderRadius:  2px               → rounded-1     ⚠ ikke rounded-2!
paddingBlock:  24px              → py-sp-4
paddingInline: 24px              → px-sp-4
gap:           20px              → ingen direkte token; bruk space-y-5 (20px) eller arbitrary
border:        1px solid #E0E0DC → border border-divider
bg:            #FFFFFF           → bg-surface
```

### Input (`6V4-0` representativ for alle Personalia/Passord-felter)

```
borderRadius:  2px               → rounded-1
height:        40px              → h-10 (eller egen token --height-profile-input: 40px)
paddingBlock:  10px
paddingInline: 14px              → px-sp-3 (16px ≈ 14px)
border:        1px solid #E0E0DC → border border-divider
```

> **Avvik fra 75-0 reference:** 75-0 sier 44px h. Profile-area bruker 40px.
> Begge er Paper-eksakte for sin kontekst. I koden brukes `--height-auth-input`
> (48px) som er enda høyere — det er det vi godtar inntil vi skiller
> auth-input fra profile-input.

### "Lagre endringer" primary CTA (`6VP-0`, høyre i Personalia-card)

```
borderRadius:  2px           → rounded-1
paddingBlock:  10px          → py-2.5
paddingInline: 24px          → px-sp-4
height:        ingen fixed   → effektiv 38px (10 + body-sm 18 lh + 10)
bg:            #FF3333       → bg-aka
```

→ **Bruk `<Button variant="primary" size="sm" type="submit">`.**

> **Padding-basert, ikke height-basert.** Paper setter ingen `height` på 6VP-0 —
> kun `paddingBlock: 10px`. Tidligere brukte vi `h-9` (36px) som ble 2px for
> kort. Button-primitiven bruker nå `py-2.5 px-sp-4 text-body-sm` på sm.

### "Endre passord" outline button (`6W7-0`)

```
borderRadius:  2px              → rounded-1
paddingBlock:  10px             → py-2.5
paddingInline: 24px             → px-sp-4
height:        ingen fixed      → effektiv 38px
border:        1.5px solid #1A1A1A  → border-[1.5px] border-solid border-ink  (paper-exact: 6W7-0)
```

→ **Bruk `<Button variant="outline" size="sm">`.**
> Border 1.5px er Profile-area-spesifikt — 75-0 reference bruker 1px.

---

## 4. Profile-area mobile (artboard `7UT-0` — Personlig informasjon Mobile)

**Verifisert: 2026-04-25.**

### Cards (`80B-0` Personalia, `811-0` Passord)

```
borderRadius:  4px               → rounded-2  ⚠ avviker fra desktop (2px)
paddingBlock:  20px              → py-5 (sp-5 = 32px, så ikke 1:1; eller py-[20px])
paddingInline: 16px              → px-sp-3
border:        1px solid #E0E0DC → border border-divider
bg:            #FFFFFF           → bg-surface
```

> **Inkonsistens i Paper:** desktop = 2px, mobile = 4px. **Vår beslutning
> (Alexander, 2026-04-25):** bruk 2px på begge så det matcher inputs + CTA.
> Ergo `rounded-1` overalt.

### Mobile primary CTA (`80Z-0`)

```
height:        44px         → h-11
borderRadius:  2px          → rounded-1
bg:            #FF3333      → bg-aka
```

### Mobile outline (`81G-0`)

```
height:        44px           → h-11
borderRadius:  2px            → rounded-1
border:        1px solid #1A1A1A   ⚠ NB: 1px på mobile, 1.5px på desktop
```

→ Button-primitive må kunne bytte border-thickness pr. breakpoint. Inntil
videre: bruk `lg:border-[1.5px]` overstyring for "Endre passord".

---

## 5. Mappingstabell — borderRadius

| Paper computed | Tailwind | CSS-variable |
|---|---|---|
| `2px` | `rounded-1` | `--radius-1` |
| `4px` | `rounded-2` | `--radius-2` |
| `8px` | `rounded-3` | `--radius-3` |
| `12px` | `rounded-4` | `--radius-4` |
| `9999px` | `rounded-full` | — |

## 6. Mappingstabell — spacing

| Paper computed | Tailwind | CSS-variable |
|---|---|---|
| `4px` | `sp-1` | `--spacing-sp-1` |
| `8px` | `sp-2` | `--spacing-sp-2` |
| `12px` | (tall — ikke sp-token) | bruk `gap-3` / `p-3` |
| `16px` | `sp-3` | `--spacing-sp-3` |
| `20px` | (tall — ikke sp-token) | bruk `p-5` / `gap-5` |
| `24px` | `sp-4` | `--spacing-sp-4` |
| `32px` | `sp-5` | `--spacing-sp-5` |
| `48px` | `sp-6` | `--spacing-sp-6` |
| `64px` | `sp-7` | `--spacing-sp-7` |

> Spacing 10/12/14/20px finnes ikke som tokens. Velg enten nærmeste sp-token,
> bruk `p-2.5` / `p-3` / `p-3.5` / `p-5` (Tailwind core), eller dokumenter
> avviket og bruk arbitrary (`p-[10px]` med `paper-exact`-kommentar).

## 7. Mappingstabell — semantiske farger

| Paper hex | Brand-token | Semantic-token |
|---|---|---|
| `#FF3333` | `aka` | brand-CTA |
| `#1A1A1A` | `kuro` | `ink` |
| `#FFFFFF` | `shiro` | `surface` |
| `#F5F5F3` | `unohana` | `canvas` |
| `#E0E0DC` | `sakai` | `divider` |

→ I komponenter: bruk semantic-tokens (`bg-surface`, `text-ink`,
`border-divider`). Bruk brand-token kun der designet eksplisitt forutsetter
samme farge i light og dark mode (CTA-er med `bg-aka`).

---

## 8. Workflow-regel

1. **Få Paper-node-ID-en** før du skriver én eneste utility-klasse.
2. **Kjør `get_computed_styles`** for den noden.
3. **Skriv Paper-verdiene som kommentar** over klassen:
   ```tsx
   {/* Paper 6UZ-0: radius 2px, p 24/24, gap 20, 1px #E0E0DC */}
   <section className="rounded-1 border border-divider bg-surface p-sp-4">
   ```
4. **Slå opp denne fila** for radius/spacing/farge → Tailwind-utility.
5. **Hvis Paper-verdien ikke har et token** (10px, 14px, 20px, 38px, …):
   - velg nærmeste sp/h-token og dokumenter forskjellen, eller
   - lag et nytt token i `app/globals.css`, eller
   - bruk arbitrary med `/* paper-exact: <node-id> */`-annotasjon.

Denne fila er en sannhetskilde — oppdater den når du verifiserer en ny node,
ikke i hukommelsen.
