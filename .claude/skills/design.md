# RawBlock Design System

## Overview

RawBlock is an unapologetic, anti-design system that strips interfaces down to their structural bones. Built for experimental portfolios and avant-garde art sites, it embraces thick borders, system-level aesthetics, and the raw power of black-on-white. There are no rounded corners, no shadows, no polish. Every element looks like it was assembled from HTML primitives -- because that is the point. This is brutalism as a design language.

---

## Colors

- **Black** (#000000): Text, borders, fills
- **White** (#FFFFFF): Background, inverse text
- **Blue** (#0000FF): Links only (hyperlink blue)
- **Surface Base** (#FFFFFF): App background
- **Surface Inverted** (#000000): Inverted sections
- **Success** (#008000): Success (pure green)
- **Warning** (#FFA500): Warning (pure orange)
- **Error** (#FF0000): Error (pure red)
- **Info** (#0000FF): Info (same as link blue)

## Typography

- **Headline Font**: Archivo Black
- **Body Font**: Work Sans
- **Mono Font**: Space Mono

- **h1**: Archivo Black 64px regular, 1.0 line height
- **h2**: Archivo Black 48px regular, 1.05 line height
- **h3**: Archivo Black 32px regular, 1.1 line height
- **h4**: Work Sans 22px semibold, 1.2 line height
- **body**: Work Sans 16px regular, 1.6 line height
- **small**: Work Sans 14px regular, 1.5 line height
- **tiny**: Work Sans 12px regular, 1.4 line height
- **mono**: Space Mono 15px regular, 1.5 line height

---

## Spacing

Base unit: 8px (intentionally irregular usage)
Spacing is deliberately inconsistent to create visual tension. Use the scale below as a starting point, then break it when the design demands it.
- **sp-1**: 4px
- **sp-2**: 8px
- **sp-3**: 16px
- **sp-4**: 24px
- **sp-5**: 40px
- **sp-6**: 64px
- **sp-7**: 80px
- **sp-8**: 120px

## Border Radius

- **radius-none** (0px): All elements -- no rounding
Every single element uses 0px border radius. No exceptions.

## Elevation

RawBlock uses **no shadows**. Visual hierarchy is achieved exclusively through border weight and scale contrast.
- **shadow-none**: None. All elements.
Use border-thin (1px), border-thick (3px), or border-heavy (5px) to define element boundaries.

## Components

### Buttons
#### Primary
black (#000000) fill, white (#FFFFFF) text, 3px black border, square. 2px tracking. uppercase text-transform. Hover: background white, text black (full inversion). Active: background black, text white, border 5px.
#### Secondary
white fill, black text, 3px black border, square. Hover: background black, text white.
#### Ghost
transparent, black text, no border. underline text-decoration. Hover: text blue.
#### Destructive
error (#FF0000) fill, white text, 3px black border, square. Hover: background black, text error.
#### Sizes
Sizes: Small (6px 16px, 12px, 32px), Medium (10px 24px, 14px, 44px), Large (16px 40px, 18px, 56px).
#### Disabled State
surface-sunken fill, content-tertiary text, 3px #CCCCCC border.
- disabled cursor
---

### Cards
#### Default
white fill, 3px black border, square, no shadow. sp-4/(24px) padding.
#### Elevated
white fill, 5px black border, square, none (heavier border = more importance) shadow. sp-4 padding.
---

### Inputs
surface-sunken (#F0F0F0) fill, content-primary text, 3px black border, square. Space Mono 15px. 10px/12px padding.
- **Default**: 3px black border.
- **Hover**: 3px black border, background #E8E8E8 other.
- **Focus**: 5px black border, outline none other.
- **Error**: 3px error border.
- **Disabled**: 3px #CCCCCC border, background #F5F5F5 other.
#### Label
content-primary text. Archivo Black 14px regular uppercase. 4px margin-bottom.
#### Helper Text
content-secondary (default) | error (error state) text. Work Sans 12px regular. 4px margin-top.
---

### Chips
#### Filter Chip
white fill, black text, 2px black border, square. 4px/12px padding, uppercase, 10px, tracking 1px text-transform. Active: background black, text white.
#### Status Chip
square, 2px respective color border. 11px semibold uppercase tracking 1px. 2px/10px padding.
- **Active**: #FFFFFF fill, #008000 text, #008000 border.
- **Warning**: #FFFFFF fill, #FFA500 text, #FFA500 border.
- **Error**: #FFFFFF fill, #FF0000 text, #FF0000 border.
- **Default**: #FFFFFF fill, #000000 text, #000000 border.
---

### Lists
transparent, Work Sans, 16px text. 3px black divider, 12px 0px item padding. Hover: text-decoration underline. Active: background black, text white, full-width.
- No trailing icons; text only
---

### Checkboxes
20px x 20px, 3px black border, square. white unchecked background, black checked background, white, 3px stroke checkmark. Focus: 5px border. Disabled: border #CCCCCC, background #F5F5F5.
---

### Radio Buttons
20px x 20px, 3px black border. circle (the one exception to 0px radius) shape. Unchecked: white fill. Selected: black border, inner dot 10px black. Focus: 5px border. Disabled: border #CCCCCC.
---

### Tooltips
black fill, white, 13px, Space Mono text, square, none (inverted block) border, no shadow. 8px/12px padding, none (positioned directly adjacent) arrow, 260px max width.
---

## Do's and Don'ts

1. **Do** use thick borders (3-5px) as the primary visual organizer; they replace shadows entirely.
2. **Don't** round any corners -- ever. Sharp edges are non-negotiable in this system.
3. **Do** use full color inversions (black to white, white to black) for hover and active states.
4. **Don't** use opacity for disabled states; use lighter border colors and grey fills instead.
5. **Do** use Archivo Black at large sizes (48-64px) for maximum visual impact.
6. **Don't** use the blue (#0000FF) for anything other than hyperlinks; it is reserved.
7. **Do** embrace intentional spacing irregularity -- asymmetric layouts are encouraged.
8. **Do** use uppercase + tracking for buttons and labels to amplify the raw aesthetic.
9. **Don't** add decorative images, icons, or illustrations; content and typography do the work.
10. **Don't** polish or refine; if something looks too "designed," strip it back further.

---

## RakaIT project adaptation

The design contract for every page of the RakaIT web app (`web/`). Follow it when
adding or changing a page or component; when the code and this file disagree,
fix one of them in the same change. Tokens and component classes live in
`web/src/app/globals.css`, fonts and site chrome in `web/src/app/layout.tsx`,
formatters, labels and store order in `web/src/lib/format.ts`, shared UI in
`web/src/components/`.

**Visual language: RawBlock** (`.claude/skills/design.md`, adopted in SPEC
round 4): black on white, thick borders, 0 px radius, no shadows, no
decorative icons, full inversion for hover and emphasis. The user's round-4
decisions refine it for a Thai price-comparison site: Thai partner fonts,
product photos kept, ▲▼ kept, status colours darkened (light) or lightened
(dark) until they pass WCAG AA, and dark mode as the same system inverted.
Where this adaptation section and the RawBlock text above differ, this section wins and says why.

Rule checks come from the project skill `.claude/skills/ui-ux-pro-max`
(MIT, nextlevelbuilder/ui-ux-pro-max-skill): its accessibility, touch,
performance, typography and chart rules apply to every change. Its
product-wide style recommendations do not: RawBlock is the visual direction.

### 1. Product principles

1. **Price first, then evidence.** Every view answers "where is it cheapest right
   now?" before it explains why. ML output (fair price, Deal Score, cluster,
   recommendation) is supporting evidence and is never shown without the price.
2. **Consumer first, statistics on request.** Pages speak to shoppers: hero
   numbers, pictures, charts. Model quality (R², MAPE, n, accuracy) stays visible
   but small (`text-xs text-subtle` with an "(i)" toggle panel), and full tables,
   formulas and tree rules live in a collapsed "รายละเอียดทางสถิติ" section.
3. **Honest models.** When a model is below its usefulness threshold, say so in
   plain Thai and say what is used instead. Never invent a value: missing is `–`.
4. **Thai first.** UI copy is Thai; model terms stay in English where Thai readers
   use them (Deal Score, K-Means, R²).
5. **Storefront, honestly.** The layout reads as a Thai IT store (announcement
   bar, wide search, category menu, hero banner, product cards with CTAs) built
   from RawBlock blocks: white page, 3 px black borders, black CTAs.
   Every banner and button shows real data or leads somewhere real: no cart,
   login, delivery tracking, invented promotions or contact details the site
   does not have (it sells nothing). No carousels or pop-ups.
6. **Fast by default.** Server components; client components only for real
   interaction (chart hover, auto-submitting selects).

### 2. Voice and copy

| Rule | Do | Don't |
|---|---|---|
| Short, factual sentences | ▼ ถูกกว่าราคายุติธรรม 12% | ดีลสุดคุ้ม! ห้ามพลาด!! |
| Numbers carry the claim | ราคาต่ำสุดตอนนี้ ฿11,900 ที่ JIB | ราคาดีที่สุดในตลาด |
| Explain a chart in one line under it | จุดที่อยู่ใต้เส้นมาก ๆ คือได้สเปกเยอะในราคาต่ำกว่าตลาด | Paragraphs of theory |
| Admit limits | ยังมีข้อมูลยอดขายไม่พอสำหรับจัดกลุ่ม | Hide the section silently |
| Store names exactly as branded | JIB, IHAVECPU, IT City, BaNANA | Jib, Ihavecpu, ITCity |

Never hard-code the number or list of stores ("3 ร้าน"); derive it from
`MERCHANTS` / `merchantList()` in `format.ts`.

#### Glossary (use these exact strings)

| Concept | UI label | Hint |
|---|---|---|
| Fair market value (MLR) | ราคายุติธรรม | ประเมินจากสเปกด้วย Multiple Linear Regression |
| Deal Score | Deal {score} | 0–100 (50 = ราคายุติธรรม) |
| `buy_now` | ซื้อเลย | |
| `wait` | รอก่อน | |
| `fair_price` | ราคาเหมาะสม | |
| `hidden_gem` | ขายดี แต่คนดูน้อย | ขายได้ดีกว่าสินค้าส่วนใหญ่ในร้านเดียวกัน แต่มีคนเข้าดูน้อยกว่ารุ่นขายดีทั่วไป |
| `community_favorite` | ขายดี คนดูเยอะ | ขายได้ดีกว่าสินค้าส่วนใหญ่ในร้านเดียวกัน และมีคนเข้าดูมากกว่ารุ่นขายดีทั่วไป |
| `overpriced_hype` | คนดูเยอะ แต่ขายน้อย | มีคนเข้าดูเยอะ แต่ขายได้น้อยกว่าที่ควรเมื่อเทียบกับคนดู |
| `niche` | คนดูน้อย ขายน้อย | ทั้งคนดูและยอดขายต่ำกว่าสินค้าส่วนใหญ่ |
| Group hints (rule) | Plain Thai for shoppers (SPEC round 11): never "มัธยฐาน", "K-Means", "บ่งบอก" or "z"; the exact rule lives in "รายละเอียดทางสถิติ" and the split line on /insights | |
| Offer demand line | คนดู N ครั้ง · ขายแล้ว N ชิ้น · ขายได้ ~… (JIB and others) / สต็อกลดลง ~… (IHAVECPU), rate from `salesRate`; zero = ยังไม่เห็นยอดขายช่วงนี้ (IHAVECPU: สต็อกยังไม่ลดลงช่วงนี้); unknown = nothing | |
| Insights group tile | คนดูโดยทั่วไป (median `views_median`; mean only for payloads without it) | |
| Gap vs fair (card tag) | ▼ ถูกกว่าราคายุติธรรม x% · ▲ แพงกว่าราคายุติธรรม x% (`FairGapTag`) | |
| Fair price untrusted (card) | ประเมินไม่แน่นอน + "ราคายุติธรรมของรุ่นนี้อาจผิด จึงไม่นับเป็นดีล" | |
| No fair price (card) | ยังประเมินราคายุติธรรมไม่ได้ (สเปกในชื่อสินค้าไม่ครบ) | |
| Card reason (`cardReason`) | ส่วนต่างเกินช่วง ±y% · ส่วนต่างยังอยู่ในช่วง ±y% · ใกล้เคียงราคายุติธรรม · ยังไม่ทราบช่วงคลาดเคลื่อน · ยังไม่ถึงเกณฑ์ซื้อเลย (DEAL 80) · ยังไม่ถึงเกณฑ์รอก่อน (DEAL 20) | |
| Buy / wait reason (pipeline) | ถูกกว่าราคายุติธรรม x% ซึ่งเกินช่วงคลาดเคลื่อน ±y% จึงถูกกว่าตลาดชัดเจน [และสต็อกเหลือน้อย] · แพงกว่าราคายุติธรรม x% ซึ่งเกินช่วงคลาดเคลื่อน ±y% จึงแพงกว่าตลาดชัดเจน (no prefix) | |
| Inside-band reason (pipeline) | ถูกกว่า/แพงกว่าราคายุติธรรม x% แต่ยังอยู่ในช่วงคลาดเคลื่อน ±y% จึงยังสรุปไม่ได้ว่าถูกกว่า/แพงกว่าตลาดจริง | |
| In stock / sold out | ● มีของ / ○ หมด (`SoldOutTag`); a model sold out everywhere: ○ หมดทุกร้าน | |
| Categories | การ์ดจอ · ซีพียู · แรม · SSD | |
| Nav | หมวดหมู่สินค้า (menu) · หน้าแรก · การ์ดจอ · ซีพียู · แรม · SSD · ภาพรวมตลาด | |
| Header shortcuts | ดีลเด็ด · เทียบหลายร้าน · ภาพรวมตลาด | |
| 404 title / line | ไม่พบหน้านี้ / ลิงก์อาจผิด หรือสินค้านี้ไม่มีขายแล้ว | |
| 404 action | กลับไปหน้ารวม → | |
| Error title / line / action | ระบบกำลังยุ่ง / โหลดหน้านี้ไม่สำเร็จ ลองใหม่อีกครั้งในอีกสักครู่ / ลองใหม่ (same in `error.tsx` and `global-error.tsx`) | |

No icons and no emoji (RawBlock rule 9; skill rule `no-emoji-icons`): every
badge, button and link is its words. The only symbols are text characters
that carry meaning: ▼ / ▲ on price gaps, ● / ○ on stock, → on CTAs, ↗ on links
to a store, + / − on disclosures (`.disclosure`), ↓ on selects and "(i)" on
statistics and group explanations that open a panel on tap, click or keyboard
(never a `title`-only tooltip: phones cannot show it). A missing product photo shows the category name in
type, not a glyph.

### 3. Design tokens

All colours are CSS variables on `:root`, redefined under
`@media (prefers-color-scheme: dark)` (the site has no other theme switch).
Tailwind utilities map to them (`bg-surface`, `text-muted`, `border-border`
...). Components never use raw hex. `.inverted` blocks (announcement bar, deal
of the week) and hover inversions (`.invert-hover`, the card CTA) swap in the
**other** theme's whole palette, so every pair inside them is a pair from the
table below.

#### Surfaces and text

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` / `--surface` | `#ffffff` | `#000000` | Page, cards, header |
| `--surface-muted` | `#f0f0f0` | `#1a1a1a` | RawBlock "sunken": inputs, selects, stat tiles, sold-out rows, missing-photo box |
| `--foreground` | `#000000` | `#ffffff` | Text, prices, primary button fill |
| `--muted` | `#474747` | `#c2c2c2` | Secondary text, axis labels |
| `--subtle` | `#666666` | `#9e9e9e` | Tertiary text: statistics notes, footer, placeholders |
| `--border` | `#000000` | `#ffffff` | Every border (3 px cards, 2 px chips and rules) |
| `--grid` | `#bdbdbd` | `#5c5c5c` | Chart gridlines only (decorative, never text) |
| `--disabled-border` | `#cccccc` | `#4d4d4d` | Disabled controls (none today) |
| `--link` | `#0000ff` | `#9999ff` | Links only, always underlined |

#### Status (text and chip border; never a chart series colour)

| Token | Light | Dark | Meaning / used by |
|---|---|---|---|
| `--good` | `#007000` | `#33cc33` | Cheaper than fair, ซื้อเลย, ▼ ถูกกว่า, ถูกที่สุด, DealMeter left block |
| `--warn` | `#a85400` | `#ffa500` | รอก่อน, ประเมินไม่แน่นอน |
| `--bad` | `#c40000` | `#ff5c5c` | Deal ≤ 30 chip, DealMeter right block |
| `--good-solid` / `--bad-solid` + `--on-solid` | `#007000` / `#c40000` + `#ffffff` | same | Solid DEAL ≥ 70 / ≤ 30 blocks, framed by `--border` |

RawBlock's pure hues (`#008000`, `#FFA500`, `#FF0000`, `#0000FF`) fail AA in at
least one theme (red 4.0:1 on white, orange 2.0:1 on white, blue 2.4:1 on
black), so each was moved along its own hue until it passes (user decision,
round 4). Blue stays reserved for links.

#### Contrast (WCAG 2.x relative luminance; text needs 4.5:1, UI parts 3:1)

| Pair | Light | Dark |
|---|---|---|
| `--foreground` on `--surface` | 21.0 | 21.0 |
| `--foreground` on `--surface-muted` | 18.4 | 17.4 |
| `--muted` on `--surface` | 9.3 | 11.8 |
| `--muted` on `--surface-muted` | 8.2 | 9.8 |
| `--subtle` on `--surface` | 5.7 | 7.8 |
| `--subtle` on `--surface-muted` | 5.0 | 6.5 |
| `--link` on `--surface` | 8.6 | 8.4 |
| `--link` on `--surface-muted` | 7.5 | 6.9 |
| `--good` on `--surface` | 6.3 | 9.8 |
| `--good` on `--surface-muted` | 5.6 | 8.1 |
| `--warn` on `--surface` | 5.3 | 10.6 |
| `--warn` on `--surface-muted` | 4.7 | 8.8 |
| `--bad` on `--surface` | 6.3 | 6.9 |
| `--bad` on `--surface-muted` | 5.5 | 5.8 |
| `--on-solid` on `--good-solid` / `--bad-solid` | 6.3 / 6.3 | 6.3 / 6.3 |
| `--border` on `--surface` (UI) | 21.0 | 21.0 |
| Primary button text (`--background` on `--foreground`) | 21.0 | 21.0 |

Status text is only placed on `--surface` or `--surface-muted`. No opacity on
text or on a container of text (it would break these ratios); sold-out rows
use `--surface-muted` instead of being dimmed.

#### Charts

Black and white, told apart by **line style and marker**, never by colour:

- PriceChart: every store is a 2.5 px `--foreground` line; stores differ by
  dash and marker in the fixed `MERCHANTS` order (`STORE_STYLES` in
  `price-chart.tsx`): JIB solid + square, IHAVECPU `9 4` + triangle, IT City
  `2 3` + diamond, BaNANA `12 4 3 4` + cross. The marker sits on each line's
  latest point and on every hovered point; the legend and the tooltip repeat
  dash + marker + store name. The cheapest store today gets a `--foreground`
  wash (16% → 0). Do not reorder `MERCHANTS` without updating `STORE_STYLES`.
- SpecScatter: hollow 5 px squares (`--foreground`, 55% stroke), the SLR line
  solid 3 px, the hovered point a filled square.
- EffectBars: raises price = solid `--foreground` bar to the right, lowers it =
  outlined bar to the left, solid zero line; every bar prints its signed value.
- Gridlines `--grid` 1 px; the x-axis baseline 2 px `--foreground`; tick text
  12 px Space Mono in `--muted`.

#### Typography

Loaded by `next/font/google` (self-hosted, no runtime request to Google); the
variables sit on `<html>` so the stacks resolve at `:root`.

| Stack (`globals.css`) | Latin face | Thai partner | Used for |
|---|---|---|---|
| `--font-display` (`.display`) | Archivo Black 400 | Kanit 700 | Page, section and card titles, wordmark |
| `--font-sans` (body) | Work Sans (variable) | Noto Sans Thai (variable) | Body, labels, buttons |
| `--font-mono` (`.tabular`) | Space Mono 400/700 | Noto Sans Thai | Prices, %, ±, DEAL, dates, inputs, table numbers |

- A Latin face has no Thai glyphs, so Thai text falls through to its partner
  (never to a system font); the baht sign (U+0E3F) comes from Noto Sans Thai.
  Verified per element with Chromium's platform-font report.
- `.display` is weight 400: Archivo Black ships only 400 (a bold request would
  fake-bold it) and Kanit is only loaded at 700, so Thai resolves to 700.
- `.caps` (uppercase + 2 px tracking) only on Latin labels (`DEAL 96`, `DEAL OF
  THE WEEK`, 404). Never on Thai: tracking breaks stacked vowels and tone
  marks. Thai buttons and chips are not uppercased or tracked.

| Role | Classes | Example |
|---|---|---|
| Page title (h1) | `display text-4xl sm:text-5xl` (product: `text-3xl sm:text-4xl`) | ภาพรวมตลาด |
| Section title (h2) | `display text-2xl`–`sm:text-4xl` | ดีลแนะนำวันนี้ |
| Card title (h3) | `display text-xl` | การ์ดจอ |
| Hero price | `tabular text-4xl sm:text-5xl font-bold` | ฿27,090 |
| Card price | `tabular text-[22px] sm:text-[26px] font-bold` | ฿16,490 |
| Row price (offers) | `tabular text-2xl font-bold` | ฿16,490 |
| Product name (card) | `text-[15px] font-semibold` (Work Sans), 2-line clamp | GeForce RTX 5060 Ti 16GB |
| Body | `text-sm` | |
| Meta | `text-xs text-muted` | การ์ดจอ · NVIDIA |
| Statistics note | `text-xs text-subtle` + "(i)" | จาก 374 รายการ (i) |

- Nothing below 12 px (`text-xs`), so RawBlock's 10–11 px chips are 12 px
  here (Thai marks need it); the scale is 12 / 14 / 15 / 16 / 18 / 20 / 24 /
  30 / 36 / 48.
- Line height 1.6 for xs/sm/base (set in `@theme`); `.display` uses 1.2:
  Thai tone marks and lower vowels need more than RawBlock's 1.0.
- Text inputs and selects are 16 px on mobile (`text-base sm:text-sm`): iOS
  zooms the page into any field below 16 px.

#### Shape, borders and spacing

- Radius: 0 on every element (`* { border-radius: 0 }` in `@layer base`). The
  app has no radio buttons, RawBlock's one exception. No `rounded-*` class
  (except `rounded-none`) and no `--radius-*` token in `web/src`.
- Depth: none. No `box-shadow`, `shadow-*` or `ring-*` (Tailwind rings are box
  shadows). Hierarchy is border weight: `.card` 3 px; `.card-heavy` 5 px for
  the one block that matters most (deal of the week, product hero, cheapest
  offer row, 404); chips, rules, table rows and stat tiles 2 px.
- Hover: clickable cards thicken to 5 px with a 2 px outline (no layout shift,
  no transform); promo and segment tiles and buttons invert fully.
- Spacing: RawBlock 8 px base; page sections `space-y-8` (list, product) /
  `space-y-12` (insights); card padding `p-5`–`p-6` (panels), `p-3 sm:p-4`
  (product cards), grid gaps `gap-3`–`gap-5`.

### 4. Layout

- Container `mx-auto max-w-7xl px-4`, main `py-6 sm:py-8`; a skip link to `#main`
  (black block when focused).
- Announcement bar (`.inverted`, `h-9`, `text-xs`): last update + cadence and
  the store list (md+) left, underlined "ร้านค้าที่เทียบราคา" (→ footer `#stores`)
  right.
- Header (`bg-surface`, 3 px bottom rule, sticky from `lg`): logo (black "R"
  block from `sm` + **Raka**<span>IT</span> wordmark in Archivo Black with
  "IT" inverted + tagline), the wide search (sunken 3 px input attached to a
  black "ค้นหา" button; full-width second row on mobile), three text
  shortcuts right (underline on hover, never wrapping). Below a 3 px rule,
  the nav row: black "หมวดหมู่สินค้า +" button opening the category menu (3 px
  card, items divided by 3 px rules, hover inverts; outside click / Esc
  close), then text links; the current page is a black block. The link row
  scrolls sideways inside itself on phones (focus outline pulled inside).
- Footer (`bg-surface`, 3 px top rule): wordmark + blurb, store list between
  2 px rules (`#stores`), menu links (blue, underlined), then the `text-xs
  text-subtle` sources line (includes "RakaIT ไม่ได้ขายสินค้าเอง").
- Grids: product cards `grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` (2 up on phones); KPI tiles
  `sm:grid-cols-2 lg:grid-cols-4`; chart panels `md:grid-cols-2`.
- Responsive, designed at 360–375 px first: the search field takes the full
  first row, selects share the second, the button wraps; offer rows stack;
  wide tables scroll inside `overflow-x-auto`. The page never scrolls sideways.

### 5. Components

#### RawBlock primitives (`globals.css`, `@layer components`)

| Class | Rules |
|---|---|
| `.card` / `.card-heavy` | `--surface` fill, 3 px / 5 px `--border`, square, no shadow. `.card-interactive` adds the 5 px hover outline. |
| `.btn` + `.btn-primary` | Min 44 px tall, 3 px border, bold. Primary: `--foreground` fill, `--background` text; hover (or hover of the parent `.group` card) inverts fully; active = 5 px border. Latin-only labels add `.caps`. |
| `.btn` + `.btn-secondary` | `--surface` fill, `--foreground` text, 3 px border; hover inverts. Used for disclosures ("ดูอีก N รายการ", "ดูกราฟราคาทุกรายการ") and the sold-out card CTA. |
| Ghost | Not used: links take `.link` instead. |
| `.chip` | Status chip: square, 2 px border in `currentColor`, `--surface` fill, 12 px semibold, `1px 8px` padding, no wrap. Tone = the text colour (`text-good`, `text-warn`, `text-bad`, `text-foreground`, `text-muted`). |
| `.chip-solid` | Solid DEAL block: `bg-good-solid` / `bg-bad-solid`, `--on-solid` text, `--border` frame. |
| `.link` | `--link`, 2 px underline (3 px on hover), offset 3 px. Every text link. |
| `.tooltip` | `--foreground` block, `--background` text, Space Mono 13 px, no border, no arrow, ≤ 260 px. Chart tooltips. |
| `.inverted` / `.invert-hover` | Swap to the other theme's palette (block, or on hover). |
| `.disclosure` | Text marker "+" / "−" for `<details>` and the category menu. |
| Inputs / selects | `--surface-muted` fill, 3 px border, Space Mono, 44 px; hover `--surface`; focus = the global 4 px outline. |
| Filter chips (cluster toggle, insights jump links) | 2 px border, min 44 px, `--surface`; active / hover = black block (`aria-pressed`). |

#### Components

| Component | File | Rules |
|---|---|---|
| **HeaderSearch** | `header-search.tsx` (client) | GET `<form action="/">`, prefilled from `?q=` and keeping `?category=`; 44 px; the button reads "ค้นหา" on every width; Suspense fallback is the same form empty, so prerendered pages keep it. The input shrinks (`min-w-0` on the label and its grid cell). |
| **Header shortcuts** | `app/layout.tsx` | ดีลเด็ด · เทียบหลายร้าน · ภาพรวมตลาด; `flex-wrap justify-end` with `min-w-0`, so below ~340 px the last one drops to a second line rather than scrolling the page (320 px has no sideways scroll). |
| **SiteNav** | `site-nav.tsx` (client) | Category menu + links; marks the current page from the pathname and `?category=` (category link on "/" with that category, "หน้าแรก" on "/" with none, "ภาพรวมตลาด" under /insights; also in the category menu). Only the link row and menu items read the query (`useSearchParams`, each in its own `<Suspense>`), so prerendered pages stay static and the menu button hydrates outside any boundary. The Suspense fallbacks mark no "/" or category link (`active={null}`): prerendered HTML cannot know the query, so it never highlights "หน้าแรก" on "/?category=…" (SPEC round 11); "ภาพรวมตลาด" depends on the pathname only and is marked in the first HTML of /insights. |
| **Hero banner** | `app/page.tsx` | Landing only (no filter/search/sort). `.inverted .card-heavy` block, one link to the product: "Deal of the week" eyebrow (`.caps`, mono), model in Archivo Black, price, fair price + % below, primary CTA "ดูราคา N ร้าน →" (inverts on hover), photo on a white tile. The product is the best Deal ≥ 60 that is in stock at ≥ 2 stores; no hero when none qualifies. |
| **Promo tiles** | `app/page.tsx` | Three `.card.invert-hover` tiles under the hero: เทียบหลายร้าน, ราคายุติธรรม, ซื้อเลยหรือรอ, each linking to the real page; title in `.display`, body line hidden on phones, "→". |
| **Listing toolbar** | `app/page.tsx` | Heading (search term / category / segment / "ดีลแนะนำวันนี้") + count left ("พบ X รุ่น", X = every matching model, with "(แสดง N อันดับแรก)" past the page limit; when a group is filtered and the heading is not already its name, "พบ X รุ่นในกลุ่ม “ชื่อกลุ่ม”"); while a group is selected its hint is a visible line under the count; category and sort AutoSubmitSelects right; cluster chips below; "ล้างทั้งหมด" link when anything is set. |
| **AutoSubmitSelect** | `auto-submit-select.tsx` (client) | Native `<select>` that submits its form on change; still works without JS via the button. "↓" text marker, `sr-only` label. |
| **Cluster toggle** | `app/page.tsx` | Filter chip `<Link>` with the label only (no `title`), `aria-pressed`; active = black block. Clicking the active one clears it; "ล้างทั้งหมด" appears when set. Before the chips, a native `<details>` whose summary is "กลุ่มความต้องการ (i)" (44 px, dotted underline): open, it takes the full row (`open:basis-full`) and shows one sunken 2 px panel with a line on what groups are built from, all four group names + hints (`dl`) and a link "ดูวิธีจัดกลุ่มและตัวเลขของแต่ละกลุ่ม →" to `/insights#demand`. Works by tap, click, Enter / Space and without JS. |
| **ProductImage** | `product-image.tsx` (client) | Merchant image hot-linked at the variant `lib/images.ts` picks for its displayed size; `width`/`height` reserve the box; `priority` (first 4 cards, product hero) = eager + `fetchpriority="high"`, everything else lazy; `referrerPolicy="no-referrer"`; on load error, or no image, the category name in `.display` on `--surface-muted`. White box in both themes. Never proxied or stored. |
| **ProductCard** | `product-card.tsx` | Whole card is one link (`.card.card-interactive`, name underlines on hover, CTA inverts). Image (4:3, white, 3 px rule under it) with **DealTag top-left** and the black "หมดทุกร้าน" block top-right when sold out → meta → name (2 lines reserved) → **price `tabular text-[22px] sm:text-[26px] font-bold`** → "ราคายุติธรรม ฿x ± y%" (80% prediction interval, `formatBand`) whenever an in-stock fair price exists and is not `fairUncertain`, else "สูงสุด ฿max" → FairGapTag (uncertain: the orange "ประเมินไม่แน่นอน" chip plus the visible line "ราคายุติธรรมของรุ่นนี้อาจผิด จึงไม่นับเป็นดีล", and no fair-price figure on the card; in stock with no fair price: the visible line "ยังประเมินราคายุติธรรมไม่ได้ (สเปกในชื่อสินค้าไม่ครบ)"), then `VerdictBadges` (recommendation + the model's demand group, then the card reason from `cardReason`, at most 2 lines, then the conflict note) → **CTA** `.btn-primary` "ดูราคา N ร้าน →" with N = stores in stock (`aria-hidden`, the card is the link; `.btn-secondary` "ดูราคาล่าสุด →" when sold out, where the price drops to a small "ราคาล่าสุด ฿x" and only the model's demand group chip shows). The fair price is never struck through or presented as a former price, and never shown without its ± band. Cards in a row are equal height (`h-full flex-col`, CTA `mt-auto`). |
| **DealTag / FairGapTag** | `badges.tsx` | DealTag: `.chip.caps` "DEAL n" in Space Mono; ≥ 70 solid green block, ≤ 30 solid red block, else a black chip. FairGapTag: "▼ ถูกกว่าราคายุติธรรม x%" as a green 2 px chip, or "▲ แพงกว่าราคายุติธรรม x%" as a black chip (never green); nothing under 0.5%. A block, not flex, with the "x%" `whitespace-nowrap` (and mono), so a wrap never splits the number. |
| **DealScore** | `badges.tsx` | Chip "Deal {n}" (mono); ≥ 70 green, ≤ 30 red, else black; `prominent` is larger. |
| **RecommendationBadge** | `badges.tsx` | Word-only chip: ซื้อเลย green, รอก่อน orange, ราคาเหมาะสม black. The reason text is a `title` tooltip in rows and a sentence in the product hero. |
| **ClusterBadge** | `badges.tsx` | Word-only chip in `--muted`; hint in `title` as an extra only (the hints are readable in the home "(i)" panel and on /insights). |
| **SoldOutTag** | `badges.tsx` | Black chip "○ หมด" / "○ หมดทุกร้าน". |
| **FairDelta** | `badges.tsx` | "▼ ถูกกว่าราคายุติธรรม x%" (good) / "▲ แพงกว่า… x%" (muted). Arrow + words, never colour alone. |
| **DealMeter** | `deal-meter.tsx` | Diverging bar: 14 px track with a 2 px border, a 3 px `--foreground` tick at the fair price, a `--good` block left when cheaper, `--bad` right when pricier, clamped at ±40%; label (mono) and fair price printed above; `role="img"` with a full-sentence label. |
| **Product hero** | `app/product/[id]/page.tsx` | `.card.card-heavy`, image left (3 px frame, ≤ 220 px on mobile), then name (h1, Archivo Black), "ราคาต่ำสุดตอนนี้" hero price at store, Deal + recommendation + the model's demand group (its only place on the page; also beside "หมดทุกร้าน" when sold out everywhere), DealMeter, reason, four stat tiles (2 px, sunken: ราคาสูงสุด, ประหยัดได้สูงสุด, จำนวนร้าน, มีของ). |
| **OfferRow** | `app/product/[id]/page.tsx` | One `.card` per offer on a fixed 4-column grid (identity · price · DealMeter · verdict) so columns align; store name in `.display`; the listing title is a `.link` with "↗"; cheapest in-stock offer is `.card-heavy` with the green "ถูกที่สุด" chip (only with 2+ in-stock offers); sold-out rows on `--surface-muted` with "○ หมด" and no price verdict; no row shows a demand group (it is the model's, shown in the hero). Demand line under the title (glossary "Offer demand line"): each rate names how its store measures it, because IHAVECPU's stock drawdown and JIB's published sold count are not comparable (SPEC round 11); never "~0.00 ชิ้น/วัน". First 6 shown, the rest behind the secondary "ดูอีก N รายการ +" button. |
| **PriceChart** | `price-chart.tsx` (client) | Daily minimum per store; **monotone cubic** curves (smooth without overshooting a recorded price), black lines told apart by dash + marker (§3 Charts), a wash under the store that is cheapest today only, `--grid` hairlines with round THB ticks, 5 date ticks, crosshair + one `.tooltip` listing every store at the hovered day, text legend with the dash + marker key. |
| **Chart sizing** | `use-width.ts` | Charts measure their container (ResizeObserver) and draw a viewBox equal to the real width, so 12 px axis text stays 12 px on a phone (a fixed 760-unit viewBox shrank it to ~5 px). Narrow charts use fewer date ticks. |
| **SpecScatter** | `spec-scatter.tsx` (client) | Price vs one spec with the fitted SLR line; axes end at the 97.5th percentile with the hidden count printed; nearest-point hover (≤ 24 px) naming model, spec and price in a `.tooltip`. |
| **EffectBars** | `effect-bars.tsx` | Diverging horizontal bars of MLR effect (% per SD), sorted by magnitude, solid (raises) / outlined (lowers), value printed on every bar, "← ทำให้ถูกลง / ทำให้แพงขึ้น →" caption. |
| **Price ladder** | insights | Table per spec tier (2 px row rules): tier + model count, starting price (`.link` to the cheapest model), typical price, cheapest model (`.link`, sm+, Work Sans). |
| **Driver ranks** | insights | Rank in a black 24 px square, importance bar = `--foreground` fill in a 2 px bordered track. |
| **Segment tiles** | insights | `.card.invert-hover` links, name in `.display`, two 2 px stat tiles (values `whitespace-nowrap`: "~1 ชิ้น / N วัน" never wraps). |
| **StatNote** | `stat-note.tsx` (client) | `text-xs text-subtle` toggle `<button>` "text (i)" with `aria-expanded` / `aria-controls` (dotted underline; `py-3.5 -my-3.5`: 44 px hit area, no layout shift); opens a sunken 2 px panel (mono) under it with the full statistic. A button, not `<details>`, because it sits inside `<p>` sentences. The panel is server-rendered with `hidden`, so the text is in the HTML. Never `title` alone. |
| **Statistics details** | insights | Native `<details>` card, collapsed by default, `.display` summary with "+" / "−". |
| **Empty state** | anywhere | `.card` with centred muted text saying what is missing and why. |
| **Global error** | `app/global-error.tsx` (client) | When the root layout itself fails: its own `<html lang="th"><body>`, imports globals.css for the RawBlock classes (site fonts not loaded, system Thai face), same block and copy as Error with `role="alert"`; "ลองใหม่" reloads the page (the router context is inside the failed layout). |
| **Error** | `app/error.tsx` (client) | Root error boundary, same block as the 404, `role="alert"`: h1 "ระบบกำลังยุ่ง", one line "โหลดหน้านี้ไม่สำเร็จ ลองใหม่อีกครั้งในอีกสักครู่", primary "ลองใหม่" (`router.refresh()` + `reset()`). No error message, digest or stack. |
| **404** | `app/not-found.tsx` | `.card.card-heavy`: "404" (mono, `.caps`), h1 "ไม่พบหน้านี้", one line, primary "กลับไปหน้ารวม →". Used for unknown routes and unknown product ids. |

### 6. Page templates

#### 6.1 Product list (`/`)

1. `sr-only` h1 (store count and names); search lives in the header.
2. Landing only: hero banner + promo tiles.
3. Listing toolbar, then the product grid, or the empty state.

#### 6.2 Product detail (`/product/[id]`)

1. Back link.
2. Product hero.
3. "เทียบราคาแต่ละร้าน": OfferRows.
4. Price history card with "ชี้หรือแตะบนกราฟ…" hint.
5. Model-level specs (`dl`, 1–3 columns) + note on how specs are reconciled.

#### 6.3 Market insights (`/insights`, nav "ภาพรวมตลาด")

Every consumer section answers a shopper's question in words and prices;
model output appears only as plain-Thai phrasing plus a StatNote. Helpers live
in `lib/market.ts`.

1. h1 + one-sentence purpose + computed time, then jump-link chips to the four
   sections (anchors, `py-2` targets).
2. **งบเท่านี้ได้สเปกแค่ไหน** (`#ladder`): one card per category: name,
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
4. **ของที่คนซื้อจริง** (`#demand`): one clickable tile per segment name that
   has listings, in the fixed chip order, linking to `/?cluster=…`; typical
   views ("คนดูโดยทั่วไป" = the segment's `views_median`, the mean only for
   payloads without it) and a sales tile; **model** count and share. Sales tile (SPEC round
   9): with model 2026.11-v9+ (`sales_feature: "store_rank_pct"`, per-segment
   `sales_beats_pct`) it reads อันดับยอดขาย "ขายดีกว่า ~N%" + "ของสินค้าในร้านเดียวกัน"
   (N = `sales_beats_pct` × 100, rounded: the share of the same store's
   listings with a rate that sold strictly less, `(min rank − 1) / count`,
   averaged per store, then across stores, then over the group's models), never a summed
   ชิ้น/วัน, because stores measure sales differently (JIB = the store's
   published sold count, IHAVECPU = stock drawdown); a note under the tiles
   and the statistics line say so. Never show `sales_rank_pct` (average rank
   for ties, the clustered feature): tied zero sellers rank mid-table (7
   zeros of 10 → 0.4) though they outsell nobody. Payload fields per
   segment: `sales_rank_pct`, `sales_beats_pct` (v9+); `sales_per_day` and
   `sales_per_day_median` (also in centroids) sum incomparable store metrics
   from v9 and are for reporting only. Older payloads without
   `sales_beats_pct` keep ขายได้ "~1 ชิ้น / N วัน". The count
   is a live query counting models the way `/?cluster=…` does
   (`countModelsByCluster`, the same `MODEL_CLUSTER` aggregate), so a tile and
   the list's "พบ X รุ่น" always agree; a group with no model on sale gets no
   tile. Averages come from the per-label summary `segments` of
   `demand_kmeans` (model 2026.11-v9: one row per product model, views
   summed over stores, sales as the mean within-store percentile;
   2026.11-v8: views and sales summed over stores, `unit: "model"`;
   2026.11-v7: per listing); older payloads fall back to merging centroids
   by label. Labels (SPEC round 6; margin from the round 9 addendum): K-Means
   clusters whose centroid sells clearly above average (sales_z > 0.5, the
   same margin as for hype) are pooled and split at the median
   log(views + 1) of their listings: above = ขายดี คนดูเยอะ, the rest =
   ขายดี แต่คนดูน้อย; other clusters are คนดูเยอะ แต่ขายน้อย or
   คนดูน้อย ขายน้อย as before (names: SPEC round 7; the hint says what each is
   measured from and never repeats the name). A line under
   the tiles says both are "ขายดีกว่าค่าเฉลี่ยชัดเจน" and prints the split
   ("คนดูมากกว่า N ครั้ง"), from `split_views`, and that the split separates
   only the two best-seller groups (the other groups are not divided by it,
   so their typical views can sit on either side of it).
5. **ป้าย ซื้อเลย / รอก่อน คิดจากอะไร** (`#advice`): while the tree is below
   its bar, the three rules as badge + sentence; the accuracy vs. 60% as a
   StatNote.
6. **รายละเอียดทางสถิติ** (collapsed): data coverage, SLR table, record
   linkage, MLR EffectBars + β table + OLS diagnostics, regression-tree rules,
   K-Means vs Ward, decision-tree rules.

#### 6.4 Adding a page

Order: context → primary answer → evidence → statistics (collapsed).

```tsx
export const revalidate = 900; // 3-hour scrape; at most 15 min stale

export default async function Page() {
  const data = await query(); // server-only, typed, from lib/queries.ts
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="display text-4xl sm:text-5xl">…</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">…</p>
      </section>
      <section className="card p-5">{/* primary answer */}</section>
    </div>
  );
}
```

### 7. Data display rules

| Data | Format | Helper |
|---|---|---|
| Price | `฿12,345`, no decimals | `formatTHB` |
| Delta vs fair | "▼ ถูกกว่าราคายุติธรรม 8%", "▲ แพงกว่าราคายุติธรรม 12%" | `FairDelta`, `DealMeter` |
| Date-time | Thai medium date + short time, `Asia/Bangkok` | `formatDateTime` |
| Chart dates | Thai short month + 2-digit year (tooltip adds the day) | `PriceChart` |
| Counts | `toLocaleString("th-TH")` | |
| Missing | `–`, never `null`, `NaN`, `0` | |
| Spec values | Integers and text as stored; other numbers at most 2 decimals, trailing zeros dropped (3.5999999999999996 → 3.6); booleans ใช่ / ไม่ | `formatSpecValue` |
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
  no Deal Score, recommendation or demand group (the group is the model's and
  shows once, in the product hero).
- Badge conflicts (`lib/verdict.ts`, one rule set for card, hero and rows): the
  price verdict outranks the demand cluster, because it compares this offer's
  own price with fair value while the cluster is a views/sales signal two
  stores do not publish. ซื้อเลย + คนดูเยอะ แต่ขายน้อย keeps ซื้อเลย; รอก่อน +
  ขายดี แต่คนดูน้อย keeps รอก่อน. The withheld badge is named in a visible sentence
  under the badges (full row width in OfferRow), never a hover-only tooltip.
  The demand group is the model's (one per model since 2026.11-v8, SPEC round
  8), the same value the `?cluster=` filter selects on, so every card in a
  filtered list shows that group or, when withheld, a note that starts
  "รุ่นนี้อยู่ในกลุ่ม “…” แต่ไม่แสดงป้าย เพราะ…".
- Fair-price uncertainty (`fair_uncertain`, migration 0012): a listing priced
  more than 40% away from its fair price shows the amber "ประเมินไม่แน่นอน"
  tag instead of DEAL / "▼ ถูกกว่า", a DealMeter without a bar, no
  recommendation, and is never ranked as a deal (its Deal Score is null).
  Its card hides the fair-price figure (the product page keeps it with the
  explanation). Every other fair price carries "± y%", the half-width of its
  80% interval.
- ซื้อเลย / รอก่อน never claim more than the band shows (model 2026.11-v5, reasons reworded in 2026.11-v6):
  ซื้อเลย needs Deal ≥ 80 **and** a gap below fair larger than the "± y%"
  band; รอก่อน (pricey) needs Deal ≤ 20 **and** a gap above fair larger than
  the band. Inside the band, or with no band, the offer gets ราคาเหมาะสม and a
  reason naming both numbers, e.g.
  "ถูกกว่าราคายุติธรรม 37% แต่ยังอยู่ในช่วงคลาดเคลื่อน ±45% จึงยังสรุปไม่ได้ว่าถูกกว่าตลาดจริง"
  (whole percentages, as `formatBand` prints them). The comparison itself
  uses those printed whole percents (`Math.round`, halves up), so "ถูกกว่า 20%"
  beside "± 20%" is never "ชัดเจน". "…ชัดเจน" appears only in reasons that cleared
  the band, and those reasons quote both numbers too:
  "ถูกกว่าราคายุติธรรม 52% ซึ่งเกินช่วงคลาดเคลื่อน ±30% จึงถูกกว่าตลาดชัดเจน"
  (+ " และสต็อกเหลือน้อย" at 3 or fewer in stock), and
  "แพงกว่าราคายุติธรรม 46% ซึ่งเกินช่วงคลาดเคลื่อน ±13% จึงแพงกว่าตลาดชัดเจน".
  With no band: "ถูกกว่าราคายุติธรรม 30% แต่ยังไม่ทราบช่วงคลาดเคลื่อนของราคานี้
  จึงยังสรุปไม่ได้ว่าถูกกว่าตลาดจริง". Deal 21–79: "ราคาใกล้เคียงราคายุติธรรมของสเปกนี้".
  Sold out still gives รอก่อน ("สินค้าหมดที่ร้านนี้ รอของเข้าหรือดูร้านอื่น").
  Rule reasons carry no prefix (the old "กฎจาก Deal Score: " is gone);
  decision-tree reasons keep "Decision Tree: ". Python's `shown_pct` equals
  JS `Math.round(fraction * 100)` (`wholePct`) on every value.
- Card reason (`cardReason` in `lib/card-reason.ts`, from the headline offer's
  `bestPctVsFair`, `fairErrorPct`, `bestDeal` and `cheapestReason`, all in the
  one `listProducts` query), at most 2 lines under the recommendation, "±y%"
  and "(DEAL 80)" never split. None for timing-tree calls ("Decision Tree: …")
  or when the numbers disagree with the badge:
  ซื้อเลย / รอก่อน → "ส่วนต่างเกินช่วง ±y%"; ราคาเหมาะสม → "ส่วนต่างยังอยู่ในช่วง ±y%"
  (why a high DEAL is not ซื้อเลย), "ใกล้เคียงราคายุติธรรม" (under 0.5%),
  "ยังไม่ทราบช่วงคลาดเคลื่อน" (no band), or, when the gap clears the band but
  Deal did not reach its threshold, "ยังไม่ถึงเกณฑ์ซื้อเลย (DEAL 80)" /
  "ยังไม่ถึงเกณฑ์รอก่อน (DEAL 20)". Nothing for sold-out, uncertain or unpriced cards.
- No fair price is estimated when a listing's title lacks a core spec (VRAM and
  chip; cores and threads; capacity and speed; capacity and interface). Such a
  listing shows `–` for Deal Score, no recommendation, and the reason
  "ยังประเมินราคายุติธรรมไม่ได้ เพราะชื่อสินค้าระบุสเปกหลักไม่ครบ" — never a guessed
  "90% below fair value".
- Images: only what the merchant serves on its own listing; archive backfills
  never supply images.

### 8. Accessibility

- Every text/background pair meets WCAG AA (4.5:1) in both themes and every
  border or UI part meets 3:1: see the contrast table in §3.
- Never colour-only: Deal chips print the number, recommendations print words,
  deltas carry ▼/▲ and words, stock carries ●/○ and words, charts differ by
  dash and marker and have text legends and tooltips.
- Semantics: one h1, h2 per section, `<table>`/`<th>`, `<dl>` for specs,
  `role="img"` + `aria-label` on charts, `aria-pressed` on toggles,
  `aria-expanded` on the category menu, `sr-only` labels on selects and search.
- Focus: global `:focus-visible` outline, 4 px `--foreground`, 2 px offset (a
  white gap then a black ring on black buttons; white inside inverted blocks).
  Inside the scrolling nav row it is pulled inwards so overflow cannot clip it.
  Never `outline-none` without this replacement; no `ring-*` (box shadow).
- Pointer targets: buttons, inputs, selects, filter chips, nav links and
  header shortcuts are ≥ 44 px tall (RawBlock medium size); other standalone
  links get `py-1`–`py-2` and stay ≥ 24 × 24 CSS px (WCAG 2.2 AA), ≥ 8 px apart.
- `cursor: pointer` on buttons, selects and summaries (Tailwind v4 resets
  buttons to the default cursor); `touch-action: manipulation` on `html`.
- Motion: none (RawBlock states switch instantly by inversion; no transforms).
- External links: `target="_blank" rel="noopener noreferrer"`.

### 9. Performance

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
- Prefetch: bulk `/product/*` links (ProductCard grid, the hero, the insights
  price ladder) take `prefetch={false}`. A product page not yet in the ISR
  cache renders on prefetch, so a grid scrolled into view opened about a
  dozen database connections at once and filled the pooler. Header and nav
  links keep the default prefetch.
- Database (`lib/db.ts`): one connection per instance (`max: 1`, closed after
  5 s idle, 10 s connect timeout, no prepared statements). `next build` uses
  `DATABASE_URL` (Supabase session pooler, 5432); serving uses
  `DATABASE_RUNTIME_URL` if set, else the same URL on the transaction pooler
  (6543), which frees the server connection after every transaction.
- Five faces via `next/font/google`, self-hosted and preloaded only for the
  listed subsets (Archivo Black, Work Sans, Space Mono: latin; Kanit 700,
  Noto Sans Thai: thai). Work Sans and Noto Sans Thai are variable fonts (one
  file each for every weight).

### 10. Review checklist

- [ ] Ran the relevant `ui-ux-pro-max` checks (`--domain ux` for the concern,
      `--stack nextjs` for implementation) and its pre-delivery checklist.
- [ ] RawBlock shape: `grep -rnE "rounded-|shadow-|ring-|--radius-" web/src`
      finds nothing but `rounded-none`, comments, or 0 values.
- [ ] Cards 3 px, the key block 5 px; chips and rules 2 px; no box-shadow.
- [ ] Buttons: primary black / secondary white, 3 px, ≥ 44 px, hover inverts;
      `.caps` only on Latin labels, never on Thai.
- [ ] Headlines `.display`; prices, %, ±, DEAL `.tabular` (Space Mono).
- [ ] No icons or emoji; only the text symbols listed in §2.
- [ ] Tokens only (no hex in components); new colour pairs added to the §3
      contrast table at ≥ 4.5:1 (text) / 3:1 (UI) in light **and** dark.
- [ ] Links `.link` (blue, underlined); blue used for nothing else.
- [ ] Keyboard: every control reachable, the 4 px focus outline visible.
- [ ] Thai copy from the glossary; store count/list derived from `MERCHANTS`.
- [ ] Price is the most prominent number in its block.
- [ ] Prices and metrics via `format.ts` helpers.
- [ ] Missing data renders `–` or a written empty state.
- [ ] Statistics are present but secondary (StatNote or the collapsed section).
- [ ] Charts: black/white, dash or marker per series, legend, tooltip.
- [ ] Works at 360–375 px and 1280 px; no sideways page scroll; cards in a row
      equal height; nothing overflows a card.
- [ ] New client component only when interaction requires it.


