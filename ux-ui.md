# ux-ui.md: RakaIT Web UX/UI Template

The design contract for every page of the RakaIT web app (`web/`). Follow it when
adding or changing a page or component; when the code and this file disagree,
fix one of them in the same change. Tokens live in `web/src/app/globals.css`,
formatters, labels and store order in `web/src/lib/format.ts`, shared UI in
`web/src/components/`. The design review that shaped this version is
`ui_ux.md`.

---

## 1. Product principles

1. **Price first, then evidence.** Every view answers "where is it cheapest right
   now?" before it explains why. ML output (fair price, Deal Score, cluster,
   recommendation) is supporting evidence and is never shown without the price.
2. **Consumer first, statistics on request.** Pages speak to shoppers: hero
   numbers, pictures, charts. Model quality (R², MAPE, n, accuracy) stays visible
   but small (`text-[11px] text-subtle` with an ⓘ tooltip), and full tables,
   formulas and tree rules live in a collapsed "รายละเอียดทางสถิติ" section.
3. **Honest models.** When a model is below its usefulness threshold, say so in
   plain Thai and say what is used instead. Never invent a value: missing is `–`.
4. **Thai first.** UI copy is Thai; model terms stay in English where Thai readers
   use them (Deal Score, K-Means, R²).
5. **Calm and modern.** Light grey page, white raised cards with a soft shadow,
   one navy accent, colour reserved for meaning (status, store identity). No
   banners, carousels or pop-ups.
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

| Concept | UI label | Icon | Hint |
|---|---|---|---|
| Fair market value (MLR) | ราคายุติธรรม | | ประเมินจากสเปกด้วย Multiple Linear Regression |
| Deal Score | Deal {score} | | 0–100 (50 = ราคายุติธรรม) |
| `buy_now` | ซื้อเลย | ✓ | |
| `wait` | รอก่อน | ⏳ | |
| `fair_price` | ราคาเหมาะสม | = | |
| `hidden_gem` | ช้างเผือก | 🐘 | ยอดเข้าชมน้อย แต่ขายดี |
| `community_favorite` | ขวัญใจชุมชน | ⭐ | คนดูเยอะและซื้อจริง |
| `overpriced_hype` | กระแสแรง ขายไม่ออก | 🔥 | คนดูเยอะ แต่ยอดขายต่ำ |
| `niche` | เฉพาะกลุ่ม | 🎯 | ยอดเข้าชมและยอดขายต่ำ |
| In stock / sold out | ● มีของ / ○ สินค้าหมด | | |
| Categories | การ์ดจอ · ซีพียู · แรม · SSD | | |
| Nav | สินค้า · ภาพรวมตลาด | | |

Icons are decorative (`aria-hidden`); the label always carries the meaning.

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
| `--accent` | `#1e3a8a` | `#8fb0ff` | Primary button, active filter, headline price, focus |
| `--accent-soft` | `#e0e7ff` | `#1e2a4d` | Focus ring, hovered card border |

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
| Card / row price | `text-2xl font-bold tracking-tight tabular` | ฿16,490 |
| KPI tile value | `text-3xl font-bold tabular` | ฿4,550 |
| Product name (card) | `text-base font-semibold`, 2-line clamp | GeForce RTX 5060 Ti 16GB |
| Body | `text-sm` | |
| Meta | `text-xs text-muted` | การ์ดจอ · NVIDIA |
| Statistics note | `text-[11px] text-subtle` + ⓘ | จาก 374 รายการ ⓘ |

### Shape, depth and spacing

- Radius: `--radius-card` 12 px (cards, panels), `--radius-control` 8 px
  (inputs, buttons, inner tiles, images), full for chips and badges.
- Depth: `.card` = surface + 1 px border + `--shadow-card`. Clickable cards add
  `.card-interactive`: stronger shadow, soft-accent border and a 2 px lift on
  hover (disabled under `prefers-reduced-motion`).
- Spacing: page sections `space-y-8` (list, product) / `space-y-12` (insights);
  card padding `p-5`–`p-6` (panels), `p-4` (cards, rows); grid gaps `gap-4`–`gap-5`.

## 4. Layout

- Container `mx-auto max-w-6xl px-4`, body `py-8`.
- Header: sticky, translucent surface with blur; logo **Raka<span>IT</span>**,
  nav (สินค้า, ภาพรวมตลาด), last-updated time right-aligned.
- Footer: one `text-xs text-subtle` paragraph (sources, cadence, "รูปสินค้าเป็นของแต่ละร้าน", models, educational).
- Grids: product cards `sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`; KPI tiles
  `sm:grid-cols-2 lg:grid-cols-4`; chart panels `md:grid-cols-2`.
- Responsive, designed at 360–375 px first: the search field takes the full
  first row, selects share the second, the button wraps; offer rows stack;
  wide tables scroll inside `overflow-x-auto`. The page never scrolls sideways.

## 5. Components

| Component | File | Rules |
|---|---|---|
| **Search + filters panel** | `app/page.tsx` | One `.card`. GET `<form action="/">`: search input with a magnifier icon inside (`h-10`), category `<select>`, sort `<select>`, navy `ค้นหา` button (`h-10`). Below a divider: demand-cluster toggle buttons. Filters are URL state. |
| **AutoSubmitSelect** | `auto-submit-select.tsx` (client) | Native `<select>` that submits its form on change; still works without JS via the button. Custom chevron, `sr-only` label. |
| **Cluster toggle** | `app/page.tsx` | Pill `<Link>` with icon + label, `aria-pressed`; active = navy fill. Clicking the active one clears it; "ล้างตัวกรอง" appears when set. |
| **ProductImage** | `product-image.tsx` | Merchant thumbnail hot-linked as served (`loading="lazy"`, `referrerPolicy="no-referrer"`, `object-contain` on white). No image → category glyph on `--surface-muted`. Never proxied or stored. |
| **ProductCard** | `app/page.tsx` | Whole card is the link (`.card-interactive`). Image (4:3) with **Deal badge in the top-right corner** → meta → name → **price (largest)** + "ถึง ฿max" → ▼/▲ fair delta → footer: store count, recommendation, clusters. |
| **DealScore** | `badges.tsx` | Pill `Deal {n}`; ≥ 70 good, ≤ 30 bad, else neutral; `prominent` variant for card corners. |
| **RecommendationBadge** | `badges.tsx` | Icon + word; buy_now good, wait warn, fair neutral. The reason text is a `title` tooltip in rows and a sentence in the product hero. |
| **ClusterBadge** | `badges.tsx` | Outlined pill with icon; hint in `title`. |
| **FairDelta** | `badges.tsx` | "▼ ถูกกว่าราคายุติธรรม x%" (good) / "▲ แพงกว่า… x%" (muted). Arrow + words, never colour alone. |
| **DealMeter** | `deal-meter.tsx` | Diverging bar: grey track, tick at the fair price, green arm left when cheaper, red right when pricier, clamped at ±40%; label and fair price printed above; `role="img"` with a full-sentence label. |
| **Product hero** | `app/product/[id]/page.tsx` | `.card`, image left (≤ 220 px on mobile), then name, "ราคาต่ำสุดตอนนี้" hero price at store, Deal + recommendation, DealMeter, reason, four stat tiles (ราคาสูงสุด, ประหยัดได้สูงสุด, จำนวนร้าน, มีของ). |
| **OfferRow** | `app/product/[id]/page.tsx` | One `.card` per offer on a fixed 4-column grid (identity · price · DealMeter · verdict) so columns align; cheapest has a green ring and "ถูกที่สุด"; sold-out rows at 70% opacity. First 6 shown, the rest behind "ดูอีก N รายการ". |
| **PriceChart** | `price-chart.tsx` (client) | Daily minimum per store; **monotone cubic** curves (smooth without overshooting a recorded price), 2 px lines in store colours, a 22%→0 gradient wash under the store that is cheapest today only, hairline grid with round THB ticks, 5 date ticks, crosshair + one tooltip listing every store at the hovered day, text legend. |
| **SpecScatter** | `spec-scatter.tsx` (client) | Price vs one spec with the fitted SLR line; axes end at the 97.5th percentile with the hidden count printed; nearest-point hover (≤ 24 px) naming model, spec and price. |
| **EffectBars** | `effect-bars.tsx` | Diverging horizontal bars of MLR effect (% per SD), sorted by magnitude, value printed on every bar, "← ทำให้ถูกลง / ทำให้แพงขึ้น →" caption. |
| **KPI tile** | insights | Label → big value → unit line → statistics note with ⓘ. |
| **StatNote** | insights | `text-[11px] text-subtle` + ⓘ icon; the full statistic in `title`. |
| **Statistics details** | insights | Native `<details>` card, collapsed by default, chevron rotates when open. |
| **Empty state** | anywhere | `.card` with centred muted text saying what is missing and why. |

## 6. Page templates

### 6.1 Product list (`/`)

1. h1 (with store count) + two-line explanation of matching and Deal Score.
2. Search + filters panel.
3. "พบ N รุ่น" then the product grid, or the empty state.

### 6.2 Product detail (`/product/[id]`)

1. Back link.
2. Product hero.
3. "เทียบราคาแต่ละร้าน": OfferRows.
4. Price history card with "ชี้หรือแตะบนกราฟ…" hint.
5. Model-level specs (`dl`, 1–3 columns) + note on how specs are reconciled.

### 6.3 Market insights (`/insights`, nav "ภาพรวมตลาด")

1. h1 + one-paragraph purpose + computed time.
2. **ราคาต่อหน่วยสเปกตอนนี้**: four KPI tiles (GPU per GB VRAM, CPU per core,
   RAM per GB, SSD per TB) then four SpecScatter panels.
3. **อะไรทำให้ราคาแพงขึ้น**: EffectBars per category, MAPE as a StatNote.
4. **กลุ่มความต้องการของตลาด**: one tile per segment name (K-Means clusters
   sharing a name are merged, size-weighted), icon, share bar, averages.
5. **คำแนะนำ ซื้อเลย / รอก่อน**: whether the decision tree or the rules drive
   advice, with the current accuracy vs. the 60% bar.
6. **รายละเอียดทางสถิติ** (collapsed): data coverage, record linkage, MLR β
   table, regression-tree rules, K-Means vs Ward, decision-tree rules.

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
- Sold-out offers stay listed (dimmed) but never become the hero price when an
  in-stock offer exists.
- Images: only what the merchant serves on its own listing; archive backfills
  never supply images.

## 8. Accessibility

- Text tokens meet WCAG AA on `--surface` and `--background` in both themes.
- Never colour-only: Deal pills print the number, recommendations print words
  and icons, deltas carry ▼/▲ and words, charts have text legends and tooltips.
- Semantics: one h1, h2 per section, `<table>`/`<th>`, `<dl>` for specs,
  `role="img"` + `aria-label` on charts, `aria-pressed` on toggles,
  `sr-only` labels on selects and search.
- Focus: visible ring (`focus-visible:ring-accent-soft`); tap targets ≥ 36 px.
- Motion: hover lift disabled under `prefers-reduced-motion`.
- External links: `target="_blank" rel="noopener noreferrer"`.

## 9. Performance

- Server components with `revalidate = 900`; data through `lib/queries.ts`
  (parameterised SQL aggregated in Postgres, O(1) round trips per page).
- Client JS is limited to `PriceChart`, `SpecScatter` and `AutoSubmitSelect`;
  charts are hand-written SVG (no chart library), O(points) per render, hover
  is O(points) per pointer move.
- Images are lazy, decoded async, hot-linked from merchant CDNs (no proxying).
- One web font (Noto Sans Thai via `next/font`).

## 10. Review checklist

- [ ] Tokens only (no hex); checked in light and dark.
- [ ] Thai copy from the glossary; store count/list derived from `MERCHANTS`.
- [ ] Price is the most prominent number in its block.
- [ ] Prices and metrics via `format.ts` helpers and `.tabular`.
- [ ] Missing data renders `–` or a written empty state.
- [ ] Statistics are present but secondary (StatNote or the collapsed section).
- [ ] Charts: validated colours, legend, tooltip, never colour-only.
- [ ] Works at 360 px; no sideways page scroll.
- [ ] New client component only when interaction requires it.
