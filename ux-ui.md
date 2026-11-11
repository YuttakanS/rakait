# ux-ui.md: RakaIT Web UX/UI Template

The design contract for every page of the RakaIT web app (`web/`). Follow it when
adding or changing a page or component; when the code and this file disagree,
fix one of them in the same change. Tokens live in `web/src/app/globals.css`,
formatters, labels and store order in `web/src/lib/format.ts`, shared UI in
`web/src/components/`. The design review that shaped this version is
`ui_ux.md`.

Rule checks come from the project skill `.claude/skills/ui-ux-pro-max`
(MIT, nextlevelbuilder/ui-ux-pro-max-skill): its accessibility, touch,
performance, typography and chart rules apply to every change. Its
product-wide style recommendations do not: no verified match exists for a
price-comparison tool (searched Nov 2026), so the visual direction is this
file's. Where the two disagree, this file wins; record the reason here.

---

## 1. Product principles

1. **Price first, then evidence.** Every view answers "where is it cheapest right
   now?" before it explains why. ML output (fair price, Deal Score, cluster,
   recommendation) is supporting evidence and is never shown without the price.
2. **Consumer first, statistics on request.** Pages speak to shoppers: hero
   numbers, pictures, charts. Model quality (R², MAPE, n, accuracy) stays visible
   but small (`text-xs text-subtle` with an ⓘ tooltip), and full tables,
   formulas and tree rules live in a collapsed "รายละเอียดทางสถิติ" section.
3. **Honest models.** When a model is below its usefulness threshold, say so in
   plain Thai and say what is used instead. Never invent a value: missing is `–`.
4. **Thai first.** UI copy is Thai; model terms stay in English where Thai readers
   use them (Deal Score, K-Means, R²).
5. **Storefront, honestly.** The layout reads as a Thai IT store (announcement
   bar, wide search, category menu, hero banner, product cards with CTAs) on a
   light grey page with white raised cards and one trust-blue brand colour.
   Every banner and button shows real data or leads somewhere real: no cart,
   login, delivery tracking, invented promotions or contact details the site
   does not have (it sells nothing). No carousels or pop-ups.
6. **Fast by default.** Server components; client components only for real
   interaction (chart hover, auto-submitting selects).

## 2. Voice and copy

| Rule | Do | Don't |
|---|---|---|
| Short, factual sentences | ▼ ถูกกว่าราคายุติธรรม 12% | ดีลสุดคุ้ม! ห้ามพลาด!! |
| Numbers carry the claim | ราคาต่ำสุดตอนนี้ ฿11,900 ที่ JIB | ราคาดีที่สุดในตลาด |
| Explain a chart in one line under it | จุดที่อยู่ใต้เส้นมาก ๆ คือได้สเปกเยอะในราคาต่ำกว่าตลาด | Paragraphs of theory |
| Admit limits | ยังมีข้อมูลยอดขายไม่พอสำหรับจัดกลุ่ม | Hide the section silently |
| Store names exactly as branded | JIB, IHAVECPU, IT City, BaNANA | Jib, Ihavecpu, ITCity |

Never hard-code the number or list of stores ("3 ร้าน"); derive it from
`MERCHANTS` / `merchantList()` in `format.ts`.

### Glossary (use these exact strings)

| Concept | UI label | Icon (`Glyph` name) | Hint |
|---|---|---|---|
| Fair market value (MLR) | ราคายุติธรรม | | ประเมินจากสเปกด้วย Multiple Linear Regression |
| Deal Score | Deal {score} | | 0–100 (50 = ราคายุติธรรม) |
| `buy_now` | ซื้อเลย | check | |
| `wait` | รอก่อน | clock | |
| `fair_price` | ราคาเหมาะสม | equals | |
| `hidden_gem` | ช้างเผือก | gem | ยอดเข้าชมน้อย แต่ขายดี |
| `community_favorite` | ขวัญใจชุมชน | star | คนดูเยอะและซื้อจริง |
| `overpriced_hype` | กระแสแรง ขายไม่ออก | flame | คนดูเยอะ แต่ยอดขายต่ำ |
| `niche` | เฉพาะกลุ่ม | target | ยอดเข้าชมและยอดขายต่ำ |
| In stock / sold out | ● มีของ / ○ หมด (`SoldOutTag`); a model sold out everywhere: ○ หมดทุกร้าน | | |
| Categories | การ์ดจอ · ซีพียู · แรม · SSD | | |
| Nav | หมวดหมู่สินค้า (menu) · หน้าแรก · การ์ดจอ · ซีพียู · แรม · SSD · ภาพรวมตลาด | | |
| Header shortcuts | ดีลเด็ด · เทียบหลายร้าน · ภาพรวมตลาด | tag · scale · chart | |

Icons are inline SVG from `components/icons.tsx` (24-unit box, 2 px round
strokes), never emoji: emoji render differently per OS and cannot follow
colour tokens (skill rules `no-emoji-icons`, `icon-style-consistent`). They are
decorative (`aria-hidden`); the label always carries the meaning.

## 3. Design tokens

All colours are CSS variables on `:root`, redefined under
`@media (prefers-color-scheme: dark)` with their own validated steps (not an
automatic inversion). Tailwind utilities map to them (`bg-surface`,
`text-muted`, `bg-good-bg` ...). Components never use raw hex.

### Surfaces and text

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#f8fafc` | `#0b1120` | Page background |
| `--surface` | `#ffffff` | `#131c2e` | Cards, header, inputs |
| `--surface-muted` | `#f1f5f9` | `#1b2538` | Inner stat tiles, image placeholder |
| `--foreground` | `#0f172a` | `#e2e8f0` | Body text, prices |
| `--muted` | `#64748b` | `#94a3b8` | Secondary text, axis labels |
| `--subtle` | `#94a3b8` | `#64748b` | Tertiary text: statistics notes, footer |
| `--border` | `#e2e8f0` | `#253047` | 1 px borders, grid lines |
| `--accent` | `#1d4ed8` | `#8fb0ff` | Brand colour: search button, CTAs, category button, active filter, focus, hover |
| `--accent-soft` | `#dbeafe` | `#1e2a4d` | Focus ring, hovered card border, icon discs |
| `--topbar` / `--on-topbar` | `#0f172a` / `#cbd5e1` | `#050810` / `#94a3b8` | Announcement bar |
| `--hero-from` → `--hero-to` | `#1e3a8a` → `#2563eb` | `#142451` → `#1e3f94` | Hero banner gradient (`.hero-banner`), white text ≥ 5:1 |
| `--good-solid` / `--bad-solid` | `#047857` / `#b91c1c` | same | Solid DEAL tags with white text |

### Status (reserved: never a chart series colour)

| Token set | Meaning | Used by |
|---|---|---|
| `--good`, `--good-strong`, `--good-bg` (emerald) | Cheaper than fair, buy now, cheapest offer | Deal ≥ 70, ซื้อเลย, ▼ ถูกกว่า, DealMeter left arm, "ถูกที่สุด" ring |
| `--bad`, `--bad-strong`, `--bad-bg` (red) | Pricier than fair | Deal ≤ 30, DealMeter right arm |
| `--warn`, `--warn-bg` (amber) | Wait | รอก่อน |
| `--neutral-bg` | Neutral | Deal 31–69, ราคาเหมาะสม, meter track |

Text tokens on their `-bg` meet WCAG AA in both themes.

### Chart colours (dataviz method, validated)

| Token | Light | Dark | Role |
|---|---|---|---|
| `--store-jib` | `#2a78d6` | `#3987e5` | Categorical slot 1 (blue) |
| `--store-ihavecpu` | `#eb6834` | `#d95926` | Slot 2 (orange) |
| `--store-itcity` | `#1baf7a` | `#199e70` | Slot 3 (aqua) |
| `--store-banana` | `#eda100` | `#c98500` | Slot 4 (yellow) |
| `--series-1` | `#2a78d6` | `#3987e5` | Single-series charts (scatter, share bars) |
| `--div-neg` / `--div-pos` / `--div-mid` | blue / red / grey | | Diverging bars (effect on price) |

- Store colours follow the fixed `MERCHANTS` order and were validated as
  adjacent pairs in both modes (worst CVD ΔE 9.1 light / 8.4 dark, normal-vision
  ≥ 19.8). Do not reorder `MERCHANTS` or add a fifth store colour without
  re-running the validator (`dataviz` skill, `validate_palette.js`).
- Yellow and aqua are below 3:1 on the light surface, so store identity is
  never colour-only: every chart has a text legend, tooltips name the store, and
  the offer list is the table view.
- Store colours mark identity, never good/bad, and never colour text.

### Typography

- **Noto Sans Thai** (`--font-thai`, 400/500/600/700). No second face.
- Compared numbers use `.tabular`.

| Role | Classes | Example |
|---|---|---|
| Page title | `text-3xl font-bold tracking-tight` | เทียบราคาอุปกรณ์คอม 4 ร้าน |
| Section title | `text-xl font-semibold` (insights) / `text-lg font-semibold` (cards) | อะไรทำให้ราคาแพงขึ้น |
| Hero price | `text-4xl font-bold text-accent tabular` | ฿27,090 |
| Card price | `text-[26px] font-extrabold tracking-tight tabular` | ฿16,490 |
| Row price (offers) | `text-2xl font-bold tracking-tight tabular` | ฿16,490 |
| KPI tile value | `text-3xl font-bold tabular` | ฿4,550 |
| Product name (card) | `text-base font-semibold`, 2-line clamp | GeForce RTX 5060 Ti 16GB |
| Body | `text-sm` | |
| Meta | `text-xs text-muted` | การ์ดจอ · NVIDIA |
| Statistics note | `text-xs text-subtle` + ⓘ | จาก 374 รายการ ⓘ |

- Nothing below 12 px (`text-xs`); the scale is 12 / 14 / 16 / 18 / 24 / 30 / 36.
- Line height 1.6 for xs/sm/base (set in `@theme`): Thai tone marks and lower
  vowels need more than Tailwind's 1.43.
- Text inputs and selects are 16 px on mobile (`text-base sm:text-sm`): iOS
  zooms the page into any field below 16 px.

### Shape, depth and spacing

- Radius: `--radius-card` 12 px (cards, panels), `--radius-control` 8 px
  (inputs, buttons, inner tiles, images), full for chips and badges.
- Depth: `.card` = surface + 1 px border + `--shadow-card`. Clickable cards add
  `.card-interactive`: stronger shadow, soft-accent border and a 2 px lift on
  hover (disabled under `prefers-reduced-motion`).
- Spacing: page sections `space-y-8` (list, product) / `space-y-12` (insights);
  card padding `p-5`–`p-6` (panels), `p-4` (cards, rows); grid gaps `gap-4`–`gap-5`.

## 4. Layout

- Container `mx-auto max-w-7xl px-4`, main `py-6 sm:py-8`; a skip link to `#main`.
- Announcement bar (`bg-topbar`, `h-9`, `text-xs`): last update + cadence and
  the store list (md+) left, "ร้านค้าที่เทียบราคา" (→ footer `#stores`) right.
- Header (`bg-surface`, sticky from `lg`): logo (blue "R" tile + **Raka<span>IT</span>**
  wordmark + tagline), the wide search (2 px brand border, attached brand
  button; full-width second row on mobile), three icon+label shortcuts right.
  Below a hairline, the nav row: brand "หมวดหมู่สินค้า" button opening the
  category menu (icon, name, example brands; outside click / Esc close), then
  text links with a 2 px underline on the current page; the link row scrolls
  sideways inside itself on phones.
- Footer (`bg-surface`, top border): brand blurb, store list with store-colour
  dots (`#stores`), menu links, then the `text-xs text-subtle` sources line
  (includes "RakaIT ไม่ได้ขายสินค้าเอง").
- Grids: product cards `grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` (2 up on phones); KPI tiles
  `sm:grid-cols-2 lg:grid-cols-4`; chart panels `md:grid-cols-2`.
- Responsive, designed at 360–375 px first: the search field takes the full
  first row, selects share the second, the button wraps; offer rows stack;
  wide tables scroll inside `overflow-x-auto`. The page never scrolls sideways.

## 5. Components

| Component | File | Rules |
|---|---|---|
| **HeaderSearch** | `header-search.tsx` (client) | GET `<form action="/">`, prefilled from `?q=` and keeping `?category=`; `h-11`; Suspense fallback is the same form empty, so prerendered pages keep it. |
| **SiteNav** | `site-nav.tsx` (client) | Category menu + links; reads the pathname only (prerender-safe). |
| **Hero banner** | `app/page.tsx` | Landing only (no filter/search/sort). `.hero-banner`, `lg:aspect-[16/5]`, one link to the product: "Deal of the week" eyebrow, model, price, struck-through fair price + % below, white CTA "ดูราคา N ร้าน", image on a white tile. The product is the best Deal ≥ 60 that is in stock at ≥ 2 stores; no hero when none qualifies. |
| **Promo tiles** | `app/page.tsx` | Three `.card-interactive` tiles under the hero: เทียบหลายร้าน, ราคายุติธรรม, ซื้อเลยหรือรอ, each linking to the real page; body line hidden on phones. |
| **Listing toolbar** | `app/page.tsx` | Heading (search term / category / segment / "ดีลแนะนำวันนี้") + count left, category and sort AutoSubmitSelects right; cluster chips below; "ล้างทั้งหมด" when anything is set. |
| **AutoSubmitSelect** | `auto-submit-select.tsx` (client) | Native `<select>` that submits its form on change; still works without JS via the button. Custom chevron, `sr-only` label. |
| **Cluster toggle** | `app/page.tsx` | Pill `<Link>` with icon + label, `aria-pressed`; active = navy fill. Clicking the active one clears it; "ล้างตัวกรอง" appears when set. |
| **ProductImage** | `product-image.tsx` (client) | Merchant image hot-linked at the variant `lib/images.ts` picks for its displayed size; `width`/`height` reserve the box; `priority` (first 4 cards, product hero) = eager + `fetchpriority="high"`, everything else lazy; `referrerPolicy="no-referrer"`; on load error, or no image, the category glyph on `--surface-muted`. Never proxied or stored. |
| **ProductCard** | `product-card.tsx` | Whole card is one link (`.card-interactive`, title turns blue on hover). Image (4:3, white) with **DealTag top-left** and "สินค้าหมด" top-right when sold out → meta → name (2 lines reserved) → **price `text-[26px] font-extrabold`** → "ราคายุติธรรม ฿x ± y%" (80% prediction interval, `formatBand`) whenever an in-stock fair price exists and is not `fairUncertain`, else "สูงสุด ฿max" → BelowFairTag (uncertain: the amber "ประเมินไม่แน่นอน" tag plus the visible line "ราคายุติธรรมของรุ่นนี้อาจผิด จึงไม่นับเป็นดีล", and no fair-price figure on the card), then `VerdictBadges` (recommendation + the headline offer's cluster, conflict note under them) → **CTA bar** `bg-accent` "ดูราคา N ร้าน →" with N = stores in stock (`aria-hidden`, the card is the link; grey "ดูราคาล่าสุด" when sold out, where the price drops to a small "ราคาล่าสุด ฿x" and no badges show). The fair price is never struck through or presented as a former price, and never shown without its ± band. |
| **DealTag / BelowFairTag** | `badges.tsx` | Card tags, 6 px radius. DEAL ≥ 70 solid green, ≤ 30 solid red, else white with border; "▼ ถูกกว่าราคายุติธรรม x%" on `good-bg`. |
| **DealScore** | `badges.tsx` | Pill `Deal {n}`; ≥ 70 good, ≤ 30 bad, else neutral; `prominent` variant for card corners. |
| **RecommendationBadge** | `badges.tsx` | Icon + word; buy_now good, wait warn, fair neutral. The reason text is a `title` tooltip in rows and a sentence in the product hero. |
| **ClusterBadge** | `badges.tsx` | Outlined pill with icon; hint in `title`. |
| **FairDelta** | `badges.tsx` | "▼ ถูกกว่าราคายุติธรรม x%" (good) / "▲ แพงกว่า… x%" (muted). Arrow + words, never colour alone. |
| **DealMeter** | `deal-meter.tsx` | Diverging bar: grey track, tick at the fair price, green arm left when cheaper, red right when pricier, clamped at ±40%; label and fair price printed above; `role="img"` with a full-sentence label. |
| **Product hero** | `app/product/[id]/page.tsx` | `.card`, image left (≤ 220 px on mobile), then name, "ราคาต่ำสุดตอนนี้" hero price at store, Deal + recommendation, DealMeter, reason, four stat tiles (ราคาสูงสุด, ประหยัดได้สูงสุด, จำนวนร้าน, มีของ). |
| **OfferRow** | `app/product/[id]/page.tsx` | One `.card` per offer on a fixed 4-column grid (identity · price · DealMeter · verdict) so columns align; cheapest in-stock offer has a green ring and "ถูกที่สุด" (only with 2+ in-stock offers); sold-out rows at 70% opacity with "○ หมด" and no price verdict. First 6 shown, the rest behind "ดูอีก N รายการ". |
| **PriceChart** | `price-chart.tsx` (client) | Daily minimum per store; **monotone cubic** curves (smooth without overshooting a recorded price), 2 px lines in store colours, a 22%→0 gradient wash under the store that is cheapest today only, hairline grid with round THB ticks, 5 date ticks, crosshair + one tooltip listing every store at the hovered day, text legend. |
| **Chart sizing** | `use-width.ts` | Charts measure their container (ResizeObserver) and draw a viewBox equal to the real width, so 12 px axis text stays 12 px on a phone (a fixed 760-unit viewBox shrank it to ~5 px). Narrow charts use fewer date ticks. |
| **SpecScatter** | `spec-scatter.tsx` (client) | Price vs one spec with the fitted SLR line; axes end at the 97.5th percentile with the hidden count printed; nearest-point hover (≤ 24 px) naming model, spec and price. |
| **EffectBars** | `effect-bars.tsx` | Diverging horizontal bars of MLR effect (% per SD), sorted by magnitude, value printed on every bar, "← ทำให้ถูกลง / ทำให้แพงขึ้น →" caption. |
| **Price ladder** | insights | Table per spec tier: tier + model count, starting price (link to cheapest model), typical price, cheapest model (sm+). |
| **StatNote** | insights | `text-[11px] text-subtle` + ⓘ icon; the full statistic in `title`. |
| **Statistics details** | insights | Native `<details>` card, collapsed by default, chevron rotates when open. |
| **Empty state** | anywhere | `.card` with centred muted text saying what is missing and why. |

## 6. Page templates

### 6.1 Product list (`/`)

1. `sr-only` h1 (store count and names); search lives in the header.
2. Landing only: hero banner + promo tiles.
3. Listing toolbar, then the product grid, or the empty state.

### 6.2 Product detail (`/product/[id]`)

1. Back link.
2. Product hero.
3. "เทียบราคาแต่ละร้าน": OfferRows.
4. Price history card with "ชี้หรือแตะบนกราฟ…" hint.
5. Model-level specs (`dl`, 1–3 columns) + note on how specs are reconciled.

### 6.3 Market insights (`/insights`, nav "ภาพรวมตลาด")

Every consumer section answers a shopper's question in words and prices;
model output appears only as plain-Thai phrasing plus a StatNote. Helpers live
in `lib/market.ts`.

1. h1 + one-sentence purpose + computed time, then jump-link chips to the four
   sections (anchors, `py-2` targets).
2. **งบเท่านี้ได้สเปกแค่ไหน** (`#ladder`): one card per category: icon + name,
   the SLR slope as a sentence ("VRAM เพิ่มทุก 1 GB ราคาเพิ่มเฉลี่ยราว ฿4,400",
   rounded for copy) with reliability as a word (R² ≥ 0.75 สูง, ≥ 0.5 ปานกลาง,
   else ต่ำ), then a **price ladder** table per spec tier: starting price
   (links to that tier's cheapest model), typical price (median of each
   model's cheapest offer; one price per model), model count, cheapest model
   (hidden on mobile). The SpecScatter sits behind "ดูกราฟราคาทุกรายการ".
3. **อะไรทำให้ราคาแพงขึ้น** (`#drivers`): top 4 hardware factors per category
   as a ranked list: Thai label, one-line example (`FACTOR_HINTS`), a
   single-hue importance bar relative to factor 1, and direction in words
   (▲ ยิ่งสูง ยิ่งแพง / ▲ ราคาสูงกว่า for yes/no features). Model plumbing is
   excluded here (missing-spec flags, the generation × tier interaction,
   demand signals, `nvme` which `pcie_gen` already carries); the signed
   EffectBars (% per SD) live in the statistics section.
4. **ของที่คนซื้อจริง** (`#demand`): one clickable tile per segment name in
   the fixed chip order, linking to `/?cluster=…`; average views and sales as
   "~1 ชิ้น / N วัน"; listing count and share.
5. **ป้าย ซื้อเลย / รอก่อน คิดจากอะไร** (`#advice`): while the tree is below
   its bar, the three rules as badge + sentence; the accuracy vs. 60% as a
   StatNote.
6. **รายละเอียดทางสถิติ** (collapsed): data coverage, SLR table, record
   linkage, MLR EffectBars + β table + OLS diagnostics, regression-tree rules,
   K-Means vs Ward, decision-tree rules.

### 6.4 Adding a page

Order: context → primary answer → evidence → statistics (collapsed).

```tsx
export const revalidate = 900; // 3-hour scrape; at most 15 min stale

export default async function Page() {
  const data = await query(); // server-only, typed, from lib/queries.ts
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">…</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">…</p>
      </section>
      <section className="card p-5">{/* primary answer */}</section>
    </div>
  );
}
```

## 7. Data display rules

| Data | Format | Helper |
|---|---|---|
| Price | `฿12,345`, no decimals | `formatTHB` |
| Delta vs fair | "▼ ถูกกว่าราคายุติธรรม 8%", "▲ แพงกว่าราคายุติธรรม 12%" | `FairDelta`, `DealMeter` |
| Date-time | Thai medium date + short time, `Asia/Bangkok` | `formatDateTime` |
| Chart dates | Thai short month + 2-digit year (tooltip adds the day) | `PriceChart` |
| Counts | `toLocaleString("th-TH")` | |
| Missing | `–`, never `null`, `NaN`, `0` | |
| Model metrics | 2 decimals (R², silhouette, ARI); MAPE/accuracy as whole % in notes | `fixed` |

- Stores that do not publish views or sales (BaNANA, IT City) show no demand fields.
- Sold-out offers stay listed (dimmed) but never headline anything while an
  in-stock offer exists: the product hero, and the card's price, Deal Score
  and fair-price delta all come from in-stock offers (a sold-out listing keeps
  a stale last price). A model sold out everywhere says "หมดทุกร้าน · ราคาล่าสุด".
- Store counts on CTAs ("ดูราคา N ร้าน", the hero button) count stores **with
  stock** only (`inStockStores`). "ราคาสูงสุด (มีของ)", "ประหยัดได้สูงสุด" and
  the "ถูกที่สุด" ring use in-stock offers only.
- A sold-out offer row shows "○ หมด", its price small and muted as
  "ราคาล่าสุด ฿x", "ไม่นำมาเทียบ เพราะสินค้าหมด" in place of the DealMeter, and
  no Deal Score, recommendation or cluster.
- Badge conflicts (`lib/verdict.ts`, one rule set for card, hero and rows): the
  price verdict outranks the demand cluster, because it compares this offer's
  own price with fair value while the cluster is a views/sales signal two
  stores do not publish. ซื้อเลย + กระแสแรง ขายไม่ออก keeps ซื้อเลย; รอก่อน +
  ช้างเผือก keeps รอก่อน. The withheld badge is named in a visible sentence
  under the badges (full row width in OfferRow), never a hover-only tooltip.
  A card's cluster is the headline offer's own, never another store's.
- Fair-price uncertainty (`fair_uncertain`, migration 0012): a listing priced
  more than 40% away from its fair price shows the amber "ประเมินไม่แน่นอน"
  tag instead of DEAL / "▼ ถูกกว่า", a DealMeter without a bar, no
  recommendation, and is never ranked as a deal (its Deal Score is null).
  Its card hides the fair-price figure (the product page keeps it with the
  explanation). Every other fair price carries "± y%", the half-width of its
  80% interval.
- ซื้อเลย / รอก่อน never claim more than the band shows (model 2026.11-v5):
  ซื้อเลย needs Deal ≥ 80 **and** a gap below fair larger than the "± y%"
  band; รอก่อน (pricey) needs Deal ≤ 20 **and** a gap above fair larger than
  the band. Inside the band, or with no band, the offer gets ราคาเหมาะสม and a
  reason naming both numbers, e.g.
  "ถูกกว่าราคายุติธรรม 37% แต่ยังอยู่ในช่วงคลาดเคลื่อน ±45% จึงยังสรุปไม่ได้ว่าถูกกว่าตลาดจริง"
  (whole percentages, as `formatBand` prints them). The comparison itself
  uses those printed whole percents (`Math.round`, halves up), so "ถูกกว่า 20%"
  beside "± 20%" is never "ชัดเจน". "…ชัดเจน" appears only in reasons that cleared
  the band. Sold out still gives รอก่อน.
- No fair price is estimated when a listing's title lacks a core spec (VRAM and
  chip; cores and threads; capacity and speed; capacity and interface). Such a
  listing shows `–` for Deal Score, no recommendation, and the reason
  "ยังประเมินราคายุติธรรมไม่ได้ เพราะชื่อสินค้าระบุสเปกหลักไม่ครบ" — never a guessed
  "90% below fair value".
- Images: only what the merchant serves on its own listing; archive backfills
  never supply images.

## 8. Accessibility

- Text tokens meet WCAG AA on `--surface` and `--background` in both themes.
- Never colour-only: Deal pills print the number, recommendations print words
  and icons, deltas carry ▼/▲ and words, charts have text legends and tooltips.
- Semantics: one h1, h2 per section, `<table>`/`<th>`, `<dl>` for specs,
  `role="img"` + `aria-label` on charts, `aria-pressed` on toggles,
  `sr-only` labels on selects and search.
- Focus: visible ring (`focus-visible:ring-accent-soft`).
- Pointer targets ≥ 24 × 24 CSS px (WCAG 2.2 AA target size; standalone links
  get `py-2`), controls 36–40 px tall, ≥ 8 px apart.
- `cursor: pointer` on buttons, selects and summaries (Tailwind v4 resets
  buttons to the default cursor); `touch-action: manipulation` on `html`.
- Motion: hover lift disabled under `prefers-reduced-motion`.
- External links: `target="_blank" rel="noopener noreferrer"`.

## 9. Performance

- Server components with `revalidate = 900`; data through `lib/queries.ts`
  (parameterised SQL aggregated in Postgres, O(1) round trips per page).
- Client JS is limited to `PriceChart`, `SpecScatter` and `AutoSubmitSelect`;
  charts are hand-written SVG (no chart library), O(points) per render, hover
  is O(points) per pointer move.
- Images (see `lib/images.ts`): served straight from the merchants' CDNs at
  the smallest adequate variant (Cloudinary `c_limit,w_…,f_auto,q_auto` for IT
  City; BaNANA `-thumbnail` WebP for cards, full only for the hero; JIB
  `medium`; IHAVECPU `_150`). `<link rel="preconnect">` to the four image
  origins sits in the root `<head>`. No `next/image` optimizer: the CDNs already
  resize and re-encode, so Vercel Image Optimization would only add a cold
  transform hop and per-image quota.
- Vercel: functions pinned to `syd1` (`web/vercel.json`), the region of the
  Supabase database, so each query is a same-region round trip. Product pages
  are ISR (`generateStaticParams` returns `[]` + `revalidate = 900`): rendered
  once, then served from the edge near the visitor. The insights page is
  static with the same revalidation; the product list is dynamic (search
  params) and is the one page that always reaches the database.
- One web font (Noto Sans Thai via `next/font`).

## 10. Review checklist

- [ ] Ran the relevant `ui-ux-pro-max` checks (`--domain ux` for the concern,
      `--stack nextjs` for implementation) and its pre-delivery checklist.
- [ ] No emoji as icons; nothing under 12 px; inputs 16 px on mobile.
- [ ] Tokens only (no hex); checked in light and dark.
- [ ] Thai copy from the glossary; store count/list derived from `MERCHANTS`.
- [ ] Price is the most prominent number in its block.
- [ ] Prices and metrics via `format.ts` helpers and `.tabular`.
- [ ] Missing data renders `–` or a written empty state.
- [ ] Statistics are present but secondary (StatNote or the collapsed section).
- [ ] Charts: validated colours, legend, tooltip, never colour-only.
- [ ] Works at 360 px; no sideways page scroll.
- [ ] New client component only when interaction requires it.
