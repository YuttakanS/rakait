# ux-ui.md: RakaIT Web UX/UI Template

The design contract for every page of the RakaIT web app (`web/`). Follow it when
adding or changing a page or component; when the code and this file disagree,
fix one of them in the same change. Tokens live in `web/src/app/globals.css`,
formatters and labels in `web/src/lib/format.ts`, shared badges in
`web/src/components/badges.tsx`.

---

## 1. Product principles

1. **Price first, then evidence.** Every view answers "where is it cheapest right
   now?" before it explains why. ML output (fair price, Deal Score, cluster,
   recommendation) is supporting evidence and is never shown without the price.
2. **Honest models.** Show the model's quality next to its output (R², MAPE, n,
   balanced accuracy). When a model is below its usefulness threshold, say so in
   plain Thai and say what is used instead. Never invent a value: missing is `–`.
3. **Thai first.** UI copy is Thai; model and statistics terms stay in English
   where Thai readers in the field use them (Deal Score, R², K-Means, MAPE).
4. **Calm, dense, scannable.** A comparison tool, not a storefront: neutral
   surfaces, one accent colour, colour reserved for meaning (good/bad/warn, store
   identity). No banners, carousels, pop-ups or decorative imagery.
5. **Fast by default.** Server components and server-rendered SVG; client
   JavaScript only for interaction that cannot be a link or a form.

## 2. Voice and copy

| Rule | Do | Don't |
|---|---|---|
| Short, factual sentences | ถูกกว่าราคายุติธรรม 12% | ดีลสุดคุ้ม! ห้ามพลาด!! |
| Numbers carry the claim | ถูกสุดตอนนี้ ฿11,900 ที่ JIB | ราคาดีที่สุดในตลาด |
| Explain a model in one line under it | Ŷ = β₀ + β₁X · β₁ คือราคาที่เพิ่มขึ้นต่อสเปก 1 หน่วย | Paragraphs of theory |
| Admit limits | ยังมีข้อมูลยอดขายไม่พอสำหรับจัดกลุ่ม | Hide the section silently |
| Store names exactly as branded | JIB, IHAVECPU, BaNANA, IT City | Jib, Ihavecpu, Banana, ITCity |

Never hard-code the number or list of stores in copy ("3 ร้าน"); derive it from
`MERCHANTS` in `format.ts` so adding a store is a one-line change.

### Glossary (use these exact strings)

| Concept | UI label | Tooltip / hint |
|---|---|---|
| Fair market value (MLR) | ราคายุติธรรม | ประเมินจากสเปกด้วย Multiple Linear Regression |
| Deal Score | Deal {score} | 0–100 (50 = ราคายุติธรรม) |
| `buy_now` | ซื้อเลย | |
| `wait` | รอก่อน | |
| `fair_price` | ราคาเหมาะสม | |
| `hidden_gem` | ช้างเผือก | ยอดเข้าชมน้อย แต่ขายดี |
| `community_favorite` | ขวัญใจชุมชน | คนดูเยอะและซื้อจริง |
| `overpriced_hype` | กระแสแรง ขายไม่ออก | คนดูเยอะ แต่ยอดขายต่ำ |
| `niche` | เฉพาะกลุ่ม | ยอดเข้าชมและยอดขายต่ำ |
| In stock / sold out | มีของ / สินค้าหมด | |
| Categories | การ์ดจอ · ซีพียู · แรม · SSD | |

## 3. Design tokens

All colours are CSS variables on `:root`, redefined under
`@media (prefers-color-scheme: dark)`. Components reference tokens, never raw hex.

### Surfaces and text

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#f7f7f5` | `#121211` | Page background |
| `--surface` | `#ffffff` | `#1b1b19` | Cards, tables, header, inputs |
| `--foreground` | `#1c1c1a` | `#ececea` | Body text |
| `--muted` | `#6b6b66` | `#a0a09a` | Secondary text, captions, axis labels |
| `--border` | `#e4e4df` | `#2e2e2b` | 1 px borders, table rules, grid lines |
| `--accent` | `#1f6feb` | `#58a6ff` | Links on hover, active chip, primary button, focus |

### Semantic states (text on its own `-bg`)

| Token pair | Meaning | Used by |
|---|---|---|
| `--good` / `--good-bg` | Cheaper than fair, buy now | Deal ≥ 70, ซื้อเลย, "ถูกกว่า x%" |
| `--bad` / `--bad-bg` | Pricier than fair | Deal ≤ 30 |
| `--warn` / `--warn-bg` | Wait / caution | รอก่อน, data-quality notes |
| `--neutral-bg` | Neutral fill | Deal 31–69, ราคาเหมาะสม |

### Store identity (charts and store markers only)

| Token | Light | Dark |
|---|---|---|
| `--store-jib` | `#2c3d92` | `#8c9eff` |
| `--store-ihavecpu` | `#d9480f` | `#ff8a50` |
| `--store-banana` | `#c99700` | `#f2cc4d` |
| `--store-itcity` | `#c2185b` | `#f48fb1` |

Store colours identify a series; they never signal good or bad. A new store
needs a token pair in both themes and an entry in `MERCHANT_COLORS`.

### Typography

- Family: **Noto Sans Thai** (`--font-thai`, weights 400/500/600/700), Latin
  included. No second display face.
- All numbers that are compared (prices, %, counts, scores) use `.tabular`
  (tabular figures) so columns align.

| Role | Tailwind | Example |
|---|---|---|
| Page title (h1) | `text-2xl font-bold` | เทียบราคาอุปกรณ์คอม |
| Section title (h2) | `font-semibold` | ประวัติราคา |
| Primary price | `text-xl font-bold tabular` (card), `text-lg` (inline) | ฿11,900 |
| Body | `text-sm` | Table cells, descriptions |
| Meta / caption | `text-xs text-muted` | Category · brand, model formulas |
| Dense code-like output | `text-[11px] leading-tight text-muted` in `<pre>` | Tree rules |

### Shape and spacing

- Radius: `rounded-xl` cards and tables, `rounded-lg` inputs/buttons/inner tiles,
  `rounded-full` chips and badges.
- Borders, not shadows: `border border-border`. Hover raises nothing; it changes
  the border to `hover:border-accent`.
- Spacing scale: Tailwind 1/1.5/2/3/4/5/6. Page sections `space-y-6`
  (list page `space-y-5`), card padding `p-4`, inner tiles `p-3`, table cells
  `px-3 py-2`.

## 4. Layout

- Container: `mx-auto max-w-6xl px-4`, page body `py-6`.
- Header: logo **Raka<span>IT</span>** (accent on "IT"), nav links, last-updated
  time right-aligned (`ml-auto text-xs text-muted`). Wraps on narrow screens.
- Footer: one muted `text-xs` paragraph: data sources, update cadence, models,
  "โปรเจกต์เพื่อการศึกษา".
- Grids: product cards `grid gap-3 sm:grid-cols-2 lg:grid-cols-3`; stat tiles
  `sm:grid-cols-2 lg:grid-cols-4`; per-category panels `lg:grid-cols-2`.
- Responsive: designed at 360 px first. Wide tables sit in
  `overflow-x-auto` with a `min-w-[...]`; the page itself never scrolls
  horizontally.

## 5. Components

| Component | Where | Rules |
|---|---|---|
| **Chip** (filter link) | Home filters | A `<Link>` that rewrites query params; active = `border-accent bg-accent text-white`. Clicking an active cluster chip clears it. Filters are URL state, so every view is shareable and cacheable. |
| **Search form** | Home | Plain GET `<form action="/">`, keeps current filters in hidden inputs; placeholder gives real examples ("RTX 5060, 7800X3D, DDR5 32GB"); query capped at 80 chars. |
| **ProductCard** | Home grid | Whole card is the link. Order: meta line (category · manufacturer) + DealScore → model name → price range → footer (offers · stores, RecommendationBadge, ClusterBadges). |
| **DealScore** | Cards, offer table | Pill `Deal {n}`; ≥ 70 good, ≤ 30 bad, else neutral; `title` explains the scale; `–` when null. |
| **RecommendationBadge** | Cards, offer table | Pill; buy_now good, wait warn, fair_price neutral. In tables, the reason text sits below in `text-[11px] text-muted`, max ~220 px wide. |
| **ClusterBadge** | Cards, offer table | Outlined muted pill (clusters are descriptive, not judgements); hint in `title`. |
| **Offer table** | Product page | One row per listing, cheapest in-stock first. Columns: ร้าน / สินค้า (store bold, merchant title as external link, 2-line clamp) · ราคา · ราคายุติธรรม (+ "ถูกกว่า/แพงกว่า x%") · Deal · คำแนะนำ · สต็อก / ความต้องการ. Show only the demand fields a store publishes; never print `null`. |
| **PriceChart** | Product page | Server-rendered SVG, one line per store in its store colour, daily minimum price, 3 y-ticks in THB, first/last date on x, native `<title>` tooltips, legend below. Fewer than 2 points → one-line empty state. |
| **Insight Card** | Insights page | `section` with h2 "A./B./C./D./E. Model: what it tells the shopper", the result (tiles, coefficient table, rules), then a one-line formula/explanation in `text-xs text-muted`. |
| **Stat tile** | Insights SLR, K-Means | Label (muted xs) → big tabular value → qualifier line with metric and n. |
| **Empty state** | Any list or model section | Bordered surface box, centred muted text that says what is missing and why. |

New shared UI goes in `web/src/components/`; a component used by one page may
live in that page file.

## 6. Page templates

### 6.1 Product list (`/`)

1. h1 + one-sentence explanation (how matching and Deal Score work).
2. Search form.
3. Filter rows: category chips → demand-cluster chips (labelled "กลุ่มความต้องการ (K-Means):") → sort chips (ดีลดีที่สุด / ราคาต่ำสุด / มีขายหลายร้าน).
4. Product grid, or empty state "ไม่พบสินค้าที่ตรงกับเงื่อนไข".

### 6.2 Product detail (`/product/[id]`)

1. Back link "← กลับไปหน้ารวม".
2. Meta line, h1 model name, headline: "ถูกสุดตอนนี้ ฿x ที่ {store}" + max spread between stores.
3. Offer table.
4. Price history chart card.
5. Model-level specs (`dl`, 2–3 columns), labels from `SPEC_LABELS`.

### 6.3 Market insights (`/insights`)

1. h1 + "คำนวณล่าสุด {time}".
2. Data coverage table (per store: active listings, % linked, history rows, oldest observation).
3. One Insight Card per model, in the order of CLAUDE.md §2: A. SLR, B. MLR, C. Regression Tree, D. K-Means (+ hierarchical comparison: ARI, cophenetic r), E. Decision Tree, each with its quality metrics and threshold note.

### 6.4 Adding a page

Start from this skeleton and keep the order: context → primary answer →
evidence → method note.

```tsx
export const revalidate = 900; // matches the 3-hour scrape; 15 min staleness max

export default async function Page() {
  const data = await query(); // server-only, typed result from lib/queries.ts
  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold">…</h1>
        <p className="mt-1 text-sm text-muted">…</p>
      </section>
      {/* primary answer, then evidence cards */}
    </div>
  );
}
```

## 7. Data display rules

| Data | Format | Helper |
|---|---|---|
| Price | `฿12,345`, no decimals, Thai grouping | `formatTHB` |
| Ratio / delta | `+12%` / `-8%`; in prose "ถูกกว่า 8%", "แพงกว่า 12%" | `formatPct` |
| Date-time | Thai medium date + short time, `Asia/Bangkok` | `formatDateTime` |
| Chart dates | Thai short month + 2-digit year | in `PriceChart` |
| Counts | `toLocaleString("th-TH")` | |
| Missing | `–` (en dash), never `null`, `NaN`, `0` | |
| Model metrics | 2 decimals (R², silhouette, ARI); MAPE/accuracy as % with 1 decimal | `fixed` in insights page |

- A store that does not publish views or sales (BaNANA, IT City) simply shows no
  demand fields; do not label it "0 views".
- Sold-out offers stay visible (they inform the price history) but never become
  the "cheapest now" headline when an in-stock offer exists.
- A recommendation from rules rather than the decision tree must say so on the
  insights page, as it does now.

## 8. Accessibility

- Contrast: text tokens meet WCAG AA (4.5:1) on `--surface` and `--background`
  in both themes; check any new token pair before merging.
- Meaning is never colour-only: Deal pills print the number, recommendations
  print words, chart lines have a text legend and per-point titles.
- Semantics: one h1 per page, h2 per section, real `<table>` with `<th>`, `<dl>`
  for specs, `role="img"` + `aria-label` on SVG charts.
- External merchant links: `target="_blank" rel="noopener noreferrer"`.
- Focus: rely on visible browser focus rings; do not remove outlines. Tap
  targets (chips, buttons) at least ~32 px tall.
- `lang="th"` on `<html>`.

## 9. Performance

- Pages are React Server Components with `revalidate = 900`; data access goes
  through `lib/queries.ts` (server-only, parameterised SQL, aggregated in
  Postgres so each page is O(1) round trips).
- Charts are SVG strings rendered on the server: O(points), zero client JS.
- No client-side state libraries, no chart libraries, no web fonts beyond
  Noto Sans Thai via `next/font` (self-hosted, no layout shift).

## 10. Review checklist

- [ ] Uses tokens, not hex; works in light and dark.
- [ ] Copy is Thai, matches the glossary, no hard-coded store count.
- [ ] Prices and metrics use the `format.ts` helpers and `.tabular`.
- [ ] Missing data renders `–` or a written empty state.
- [ ] Every ML output shows its quality metric or threshold note nearby.
- [ ] Usable at 360 px; wide tables scroll inside their container.
- [ ] Headings, tables and charts are semantic and labelled.
- [ ] No new client component unless interaction requires it.
