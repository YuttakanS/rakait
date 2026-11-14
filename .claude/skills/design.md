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
   formulas, trees and model charts live on `/ml` ("เบื้องหลัง ML", SPEC round 15).
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
| CPU spec `has_igpu` (fair-value MLR and tier tree, model 2026.11-v18) | มีกราฟิกในตัว | มีกราฟิกในตัว เทียบกับรุ่นที่ต้องใช้การ์ดจอแยก (เช่น Intel รุ่น F, Ryzen 5000 ที่ไม่มีตัว G) (`FACTOR_HINTS`; no Threadripper has one); yes/no feature: "ราคาสูงกว่า" on /insights, asked positively in tree splits (`FLAGS`) |
| CPU spec `x3d_share` (fair-value MLR and tier tree, model 2026.11-v19; replaces `x3d` in the MLR) | สัดส่วนชิปเล็ตที่มี 3D V-Cache | X3D ไม่เกิน 8 คอร์และ X3D2 มีแคชทุกชิปเล็ต ส่วน X3D 12–16 คอร์มีแค่ชิปเล็ตเดียวจากสอง (`FACTOR_HINTS`); 0 / 0.5 / 1, read "ยิ่งสูง ยิ่งแพง"; a tree split reads "ไม่ใช่ X3D" (below 0.5) or "ไม่ใช่ X3D หรือมีแคชแค่ชิปเล็ตเดียวจากสอง" |
| CPU spec `apu_series` (fair-value MLR and tier tree, model 2026.11-v19) | เป็น Ryzen ซีรีส์ APU (4000 / 8000) | ชิปแบบ APU แคชน้อยกว่า (เช่น 8500G, 8700F) เทียบกับ Ryzen รุ่นอื่นที่สเปกเท่ากัน (`FACTOR_HINTS`); yes/no feature (`BOOLEAN_FEATURES`, `FLAGS`) |
| Workstation CPU (every Threadripper, Pro or not; model 2026.11-v19, SPEC round 21) | ซีพียูเวิร์กสเตชัน โมเดลไม่ประเมินราคายุติธรรม (card line, `WORKSTATION_CARD_NOTE`) | Stored reason, printed as is on the product page: "ไม่ประเมินราคายุติธรรม: รุ่นนี้เป็นซีพียูเวิร์กสเตชัน (Threadripper) ซึ่งโมเดลราคายุติธรรมไม่ครอบคลุม จึงไม่มี Deal Score และไม่ใช้จัดอันดับดีล" (`train.WORKSTATION_REASON` = `WORKSTATION_REASON` in `format.ts`, matched verbatim by `noFairPriceNote`); the product page's deal meter reads "ไม่ประเมินราคายุติธรรม (เวิร์กสเตชัน)" (`noFairMeterText`) instead of "ยังไม่มีราคายุติธรรม". Listed with prices, never a fair price, Deal Score, recommendation or deal rank; never the "สเปกในชื่อสินค้าไม่ครบ" line |
| CPU tier split (tier tree node) | ระดับรุ่น (Ryzen / Core) | the test names a real tier, "Ryzen 5 / Core i5 หรือต่ำกว่า" (`tierTest` in `ml.ts`; tiers are 1, 3, 5, 7, 9, 11), never "R6" / "i6" (SPEC round 21) |
| MLR inputs line (/ml, each category tab) | ฟีเจอร์ที่ใช้: … | from the payload's coefficient names (`mlrInputs`), never a fixed list; "ไม่ใช้ยอดเข้าชมหรือยอดขาย ราคายุติธรรมคิดจากสเปกอย่างเดียว" when the fit has no demand signal (CPU since v18); CPU without `unlocked` adds "ไม่คิดส่วนเพิ่มของรุ่นปลดล็อก (K / X) …"; a payload with `workstation_excluded` > 0 (v19+) adds "ไม่รวมซีพียูเวิร์กสเตชัน (Threadripper) N รายการ ซึ่งไม่มีราคายุติธรรม" |
| `buy_now` | ซื้อเลย | |
| `wait` | รอก่อน | |
| `fair_price` | ราคาเหมาะสม | |
| `hidden_gem` | ขายดี แต่คนดูน้อย | ขายได้ดีกว่าสินค้าส่วนใหญ่ในร้านเดียวกัน แต่มีคนเข้าดูน้อยกว่ารุ่นขายดีทั่วไป |
| `community_favorite` | ขายดี คนดูเยอะ | ขายได้ดีกว่าสินค้าส่วนใหญ่ในร้านเดียวกัน และมีคนเข้าดูมากกว่ารุ่นขายดีทั่วไป |
| `overpriced_hype` | คนดูเยอะ แต่ขายน้อย | มีคนเข้าดูเยอะ แต่ขายได้น้อยกว่าที่ควรเมื่อเทียบกับคนดู |
| `niche` | ยอดขายไม่เด่น | กลุ่มที่เหลือจาก K-Means: ขายได้ไม่เด่นเมื่อเทียบกับสินค้าในร้านเดียวกัน ป้ายนี้ไม่ได้บอกอะไรเรื่องยอดเข้าชม (SPEC round 18, the user's option D: earlier names "คนดูน้อย ขายน้อย" (to round 16) and "ไม่เด่นทั้งคนดูและยอดขาย" (round 17) claimed views their models did not show; a views condition would have hidden 69 of 178 models, so the name claims sales only. Internal key stays `niche`. From model 2026.11-v16 the badge is kept only by models printed under the 50% sales bar (`label_fit`, `label_rule.niche_below_bar`); never write "ชื่อกลุ่มจึงไม่ได้อ้างตัวเลขใด". Its rule line is `nicheRuleText`: กลุ่มที่เหลือจาก K-Means ติดป้ายเฉพาะรุ่นที่ขายดีกว่าไม่ถึง 50% ของสินค้าในร้านเดียวกัน … ป้ายนี้ไม่ได้บอกอะไรเรื่องยอดเข้าชม (v15 payloads: no sales rule). Breaks: `CLUSTER_LABELS.niche.wrap` = ยอดขาย|ไม่เด่น) |
| Group hints (rule) | Plain Thai for shoppers (SPEC round 11): never "มัธยฐาน", "K-Means", "บ่งบอก" or "z" (one exception, SPEC round 18: the `niche` hint names it K-Means' remainder group); the exact rule lives in "รายละเอียดทางสถิติ" and the split line on /insights Exception (SPEC round 16): the list's "(i)" panel names K-Means and its three features and states the real thresholds (`split_views`, the best-seller margin, the overall medians), because a shopper must be able to check a group name against numbers; the hints themselves stay plain | |
| Offer demand line | คนดู N ครั้ง · ขายแล้ว N ชิ้น · ขายได้ ~… (JIB and others) / สต็อกลดลง ~… (IHAVECPU), rate from `salesRate`; zero = ยังไม่เห็นยอดขายช่วงนี้ (IHAVECPU: สต็อกยังไม่ลดลงช่วงนี้); unknown = nothing | |
| Insights group tile | คนดูโดยทั่วไป (median `views_median`; mean only for payloads without it) · ยอดขายโดยทั่วไป (the same median the list's group line quotes, `GroupStats.salesBeats`; a median of 0: ยังไม่เห็นยอดขาย + note "เกินครึ่งของรุ่นในกลุ่มนี้ …"); a payload with only the mean titles it ยอดขายเฉลี่ย (`shareTile`, SPEC round 18) | |
| Group evidence (card, under the group badge; SPEC rounds 16-17) | คนดู N ครั้ง · ขายดีกว่า N% ของสินค้าในร้าน (ติดตามไม่เกิน 120 วัน); under the pipeline's sales bar (`label_rule.sales_bar`, 50%): ขายดีกว่าแค่ N% … (product page: …ของสินค้าในร้านเดียวกัน). The tracking span is stated wherever sales are mentioned, so a share is not read as the store rows' lifetime "ขายแล้ว N ชิ้น". `label_rule.window_days` is a **cap**, not the window: each listing's rate is its sold delta over the span it was observed for (weeks on the live catalogue), within at most that many days, so the copy never says "in the last N days". Card form: … (ติดตามไม่เกิน 120 วัน); product page, group line, "(i)" rules, /insights tile and /ml: … ในช่วงที่ติดตาม (ไม่เกิน 120 วันล่าสุด) (`windowText`). A raw share of 0 means "outsold nothing in its stores": it reads ยังไม่เห็นยอดขาย only when the run stored `label_rule.zero_share_means_no_sales = true` (every store's lowest rate is 0), else ยังไม่ขายดีกว่าสินค้าใดในร้าน (`zeroShareText`); long form …ในช่วงที่ติดตาม (ไม่เกิน 120 วัน); payloads before 2026.11-v15 have neither bar nor window and print the bare form. N = the model's own `model_views` and `model_sales_beats_pct` (`wholePct`), stored by train. Missing one: ไม่มีข้อมูลยอดเข้าชม / ไม่มีข้อมูลยอดขาย; neither: ยังไม่มีตัวเลขยอดเข้าชมและยอดขายของรุ่นนี้. A raw 0: ยังไม่เห็นยอดขาย (ติดตามไม่เกิน 120 วัน) (no window: …ช่วงนี้); above 0 but rounding to 0%: ขายดีกว่าไม่ถึง 1% ของสินค้าในร้าน … (`salesShare`). Never 0 for unknown | |
| Group badge withheld by a deal-conflict rule (card) | One line in place of the badge and the long note: กลุ่ม: คนดูเยอะ แต่ขายน้อย (คนดู 31,200 ครั้ง · ขายดีกว่าแค่ 12% (ติดตามไม่เกิน 120 วัน)) (`withheldLine`; missing: ไม่มีข้อมูลยอดเข้าชม / ไม่มีข้อมูลยอดขาย / (ยังไม่มีตัวเลข); raw 0: ยังไม่เห็นยอดขาย (ติดตามไม่เกิน 120 วัน)). Why the badge is withheld stays on the product page | |
| Numbers do not support the group name (card; SPEC round 17) | No group badge, no group text, nothing about a contradiction: only the numbers line (คนดู N ครั้ง · ขายดีกว่า N% ของสินค้าในร้าน (ติดตามไม่เกิน 120 วัน)). Never "ไม่ตรงชื่อกลุ่ม" or "แต่โดยรวมยังคล้ายกลุ่มนี้ที่สุด" on a card. Which models these are is decided by the pipeline only (`demand_label_fits = false`, `models.label_fit`); such a model is not listed under the group and not counted on its chip | |
| Numbers do not support the group name (product page) | ความต้องการของรุ่นนี้: + the numbers (with the tracking cap), then one paragraph, at most 6 lines at 320 px and never a nested bracket or "))" (SPEC round 18): K-Means จัดรุ่นนี้ไว้กลุ่ม “…” แต่ไม่ติดป้าย เพราะยอดเข้าชม / ยอดขาย / ยอดเข้าชมและยอดขาย ไม่ตรงเกณฑ์ของป้าย (ป้ายนี้ใช้กับรุ่นที่ + the short rule, `labelRuleShort`: ขายดีกว่าอย่างน้อย 50% และคนดูไม่เกิน X ครั้ง, no window and no bracket inside); the failing number is the stored `demand_label_miss`. Then one plain reason line (`unlabelledWhy`): K-Means จัดรุ่นนี้ไว้กลุ่มนี้เพราะราคา / ยอดเข้าชม / ยอดขาย เป็นหลัก (price adds ": ราคาต่ำสุดที่มีของตอนนี้ถูกกว่า / แพงกว่า ราคากลางของรุ่นนี้ N%", `priceGapText` from `model_normalized_price`; not quoted when the gap rounds to 0%; sold out everywhere: ราคาล่าสุดที่ต่ำที่สุด (ตอนนี้หมดทุกร้าน) …), or, when the stored deciding feature is the failing number itself or none is stored, เมื่อดูยอดเข้าชม ยอดขาย และราคารวมกัน รุ่นนี้ยังคล้ายกลุ่มนี้มากกว่ากลุ่มอื่น K-Means จึงจัดไว้กลุ่มนี้. The method note sits behind the `<details>` "ทำไมตัวเลขไม่ตรงชื่อกลุ่มได้" | |
| Why this group (product page, labelled model) | ที่ได้กลุ่มนี้: ตัวเลขของรุ่นนี้ตรงเกณฑ์ของป้าย (+ the short rule, `labelRuleShort`, e.g. คนดูมากกว่า 19,120 ครั้ง และขายดีกว่าไม่ถึง 50%). One colon only: `demandWhy` never adds its own (SPEC round 18). The remainder group (2026.11-v16+): กลุ่มที่เหลือจาก K-Means และตัวเลขของรุ่นนี้ตรงเกณฑ์ของป้าย (ขายดีกว่าไม่ถึง 50%) ป้ายนี้ไม่ได้บอกอะไรเรื่องยอดเข้าชม; v15 rows: กลุ่มที่เหลือจาก K-Means ป้ายนี้ไม่ได้บอกอะไรเรื่องยอดเข้าชม. A remainder-group model at or above the bar is unlabelled and explained like the other groups (`unlabelledWhy`, miss = ยอดขาย). Shown only when the pipeline flagged the label as fitting (`demand_label_fits = true`); rows from before 2026.11-v15 print the numbers without it. The web describes the rule, it never evaluates it | |
| Selected group vs all models (list) | At most one bracket per half and the tracking cap once at the end (SPEC round 18; ≤ 3 lines at 375 px): รุ่นในกลุ่มนี้: ค่ากลางคนดู X ครั้ง (ทุกรุ่น Y ครั้ง) · ค่ากลางยอดขาย: ขายดีกว่า ~N% ของสินค้าในร้าน (ทุกรุ่น ~M%) · ติดตามไม่เกิน 120 วัน. A median of exactly 0 is written in words, never "~0%": all models → (ทุกรุ่น: เกินครึ่งยังไม่เห็นยอดขาย); the group → ค่ากลางยอดขาย: เกินครึ่งของรุ่นในกลุ่มนี้ยังไม่เห็นยอดขาย (ทุกรุ่น ~M%); both 0 → one sentence, ยอดขาย: เกินครึ่งของรุ่นในกลุ่มนี้และของทุกรุ่นยังไม่เห็นยอดขาย; the same share → … เท่ากับทุกรุ่น. No cap stored: the zero sentence ends "ช่วงนี้". Payloads before v14 have no "ทุกรุ่น" part and say ค่าเฉลี่ยยอดขาย: (`groupComparison`; the "(i)" panel keeps `groupNumbers` and `overallSalesText`) | |
| Gap vs fair (card tag) | ▼ ถูกกว่าราคายุติธรรม x% · ▲ แพงกว่าราคายุติธรรม x% (`FairGapTag`) | |
| Fair price untrusted (card, chip tooltip, product page) | ประเมินไม่แน่นอน + the listing's own gap, then "โมเดลยังประเมินรุ่นนี้ได้ไม่ดี จึงไม่ใช้จัดอันดับดีล": "ราคาจริงแพงกว่าราคายุติธรรม 42% โมเดล…" / "ราคาจริงถูกกว่าราคายุติธรรม 60% โมเดล…" (`uncertainNote(pct_vs_fair)`, `wholePct`). The product page prints `uncertainReason` = "ประเมินไม่แน่นอน: " + that note, the pipeline's `train.uncertain_reason` since 2026.11-v12 (same words, `shown_pct`), rebuilt from the stored gap so older rows read the same. Without a gap: `UNCERTAIN_NOTE` "ราคาจริงต่างจากราคายุติธรรมมาก โมเดล…". DealMeter: "ยุติธรรม ฿x ± y% · ราคาจริงแพงกว่า 42%". States the measured gap only, never a threshold ("เกิน 40%") or a guessed cause. Sibling inversion (SPEC round 19, 2026.11-v17): the lesser-spec model whose fair price is above a better sibling's prints the stored reason as is, "ประเมินไม่แน่นอน: ราคายุติธรรมของรุ่นนี้ (฿9,579) สูงกว่ารุ่นที่สเปกดีกว่า GeForce RTX 3050 8GB (฿8,328) โมเดลยังประเมินรุ่นนี้ได้ไม่ดี จึงไม่ใช้จัดอันดับดีล" (`train.sibling_reason`, recognised by `SIBLING_REASON_PREFIX`; the card drops the "ประเมินไม่แน่นอน: " lead-in, its chip says it), never the gap sentence. Only the lesser side is flagged | |
| No fair price (card) | ยังประเมินราคายุติธรรมไม่ได้ (สเปกในชื่อสินค้าไม่ครบ) | |
| Card reason (`cardReason`) | ส่วนต่างเกินช่วง ±y% · ส่วนต่างยังอยู่ในช่วง ±y% · ใกล้เคียงราคายุติธรรม (Deal 21–79 under 5%, or 0%) · ยังไม่ทราบช่วงคลาดเคลื่อน · ยังไม่ถึงเกณฑ์ซื้อเลย (DEAL 80) · ยังไม่ถึงเกณฑ์รอก่อน (DEAL 20) | |
| Buy / wait reason (pipeline) | ถูกกว่าราคายุติธรรม x% ซึ่งเกินช่วงคลาดเคลื่อน ±y% จึงถูกกว่าตลาดชัดเจน [และสต็อกเหลือน้อย] · แพงกว่าราคายุติธรรม x% ซึ่งเกินช่วงคลาดเคลื่อน ±y% จึงแพงกว่าตลาดชัดเจน (no prefix) | |
| Inside-band reason (pipeline) | ถูกกว่า/แพงกว่าราคายุติธรรม x% แต่ยังอยู่ในช่วงคลาดเคลื่อน ±y% จึงยังสรุปไม่ได้ว่าถูกกว่า/แพงกว่าตลาดจริง | |
| In stock / sold out | ● มีของ / ○ หมด (`SoldOutTag`); a model sold out everywhere: ○ หมดทุกร้าน | |
| Categories | การ์ดจอ · ซีพียู · แรม · SSD | |
| Nav | หมวดหมู่สินค้า (menu) · หน้าแรก · การ์ดจอ · ซีพียู · แรม · SSD · ภาพรวมตลาด · เบื้องหลัง ML | |
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
| **SiteNav** | `site-nav.tsx` (client) | Category menu + links; marks the current page from the pathname and `?category=` (category link on "/" with that category, "หน้าแรก" on "/" with none, "ภาพรวมตลาด" under /insights, "เบื้องหลัง ML" on /ml; also in the category menu). Only the link row and menu items read the query (`useSearchParams`, each in its own `<Suspense>`), so prerendered pages stay static and the menu button hydrates outside any boundary. The Suspense fallbacks mark no "/" or category link (`active={null}`): prerendered HTML cannot know the query, so it never highlights "หน้าแรก" on "/?category=…" (SPEC round 11); "ภาพรวมตลาด" depends on the pathname only and is marked in the first HTML of /insights. |
| **Hero banner** | `app/page.tsx` | Landing only (no filter/search/sort). `.inverted .card-heavy` block, one link to the product: "Deal of the week" eyebrow (`.caps`, mono), model in Archivo Black, price, fair price + % below, caption "Deal Score สูงสุดในรุ่นที่มีขายหลายร้าน และราคายุติธรรมไม่สูงกว่าราคาสูงสุดที่ร้านเคยตั้งเกิน 10%" (the selection rule as it is), `DealTag` next to the eyebrow, "สูงสุดที่เคยเห็นใน 120 วัน ฿x" (`maxSeenPrice`, `SEEN_WINDOW_DAYS`) under the price, primary CTA "ดูราคา N ร้าน →" (inverts on hover), photo on a white tile. The product is the best Deal ≥ 60 that is in stock at ≥ 2 stores and whose fair price is at most 10% above the highest price any store recorded for the model in price_history over 120 days (`maxSeenPrice`; a fair price above every price the market set is the model overestimating, SPEC round 13); no hero when none qualifies. |
| **Promo tiles** | `app/page.tsx` | Three `.card.invert-hover` tiles under the hero: เทียบหลายร้าน, ราคายุติธรรม, ซื้อเลยหรือรอ, each linking to the real page; title in `.display`, body line hidden on phones, "→". |
| **Listing toolbar** | `app/page.tsx` | Heading (search term / category / segment / "ดีลแนะนำวันนี้") + count left ("พบ X รุ่น", X = every matching model, with "(แสดง N อันดับแรก)" past the page limit; when a group is filtered and the heading is not already its name, "พบ X รุ่นในกลุ่ม “ชื่อกลุ่ม”"); while a group is selected its hint is a visible line under the count; category and sort AutoSubmitSelects right; cluster chips below; "ล้างทั้งหมด" link when anything is set. |
| **AutoSubmitSelect** | `auto-submit-select.tsx` (client) | Native `<select>` that submits its form on change; still works without JS via the button. "↓" text marker, `sr-only` label. |
| **Cluster toggle** | `app/page.tsx` | Filter chip `<Link>` with the label only (no `title`), `aria-pressed`; active = black block. Clicking the active one clears it; "ล้างทั้งหมด" appears when set. Before the chips, a native `<details>` whose summary is "กลุ่มความต้องการ (i)" (44 px, dotted underline): open, it takes the full row (`open:basis-full`) and shows one sunken 2 px panel with a line on what groups are built from, all four group names + hints (`dl`) and a link "ดูวิธีจัดกลุ่มและตัวเลขของแต่ละกลุ่ม →" to `/insights#demand`. Works by tap, click, Enter / Space and without JS. SPEC round 16: the panel first says the groups come from K-Means over three features at once (ยอดเข้าชม อันดับยอดขายในร้าน ราคาเทียบราคาปกติของรุ่น), then the real rules in plain words with the payload's numbers ("ขายดี" = the cluster's sales clearly above the average of all models, with the overall median; in best sellers "คนดูเยอะ" = above `split_views`; "คนดูเยอะ แต่ขายน้อย" = views clearly above sales; the overall views median). No standard-deviation figures here: the margins (`best_seller_margin_sd`, `conversion_margin_sd`) are printed on `/ml#kmeans`, from the payload, hidden when absent, each group's hint plus its typical numbers (`groupNumbers`), and links to `/ml#kmeans` and `/insights#demand`. With a group selected, a `text-xs` line under the hint compares the group with all models (`groupComparison`). Numbers a payload lacks are left out, never invented. SPEC round 17: the panel's rules are `GroupRules`: each named group = its badge rule in words with the payload's thresholds (`labelRuleText`), the neutral group = the remainder, the all-model sales line (`overallSalesText`) and how many grouped models carry no badge (`unlabelledText`); group figures (here, the comparison line and the /insights tiles) are over the models that carry the badge when the payload has them (`segments[].labelled_*`), since those are the models counted and listed; a payload without `label_rule` falls back to the number-free wording. The chips, the filter and "พบ X รุ่น" count only models whose label fits (`SHOWN_CLUSTER`). SPEC round 18: a group with no model to list this run (`emptyGroupReason`: no K-Means cluster got the name, or every member's numbers miss it) is a disabled chip, not a link: a plain `<span>` (no role, so no `aria-disabled`; its text says it), `--disabled-border` 2 px, `--surface-muted` fill, `text-subtle`, text "{name} · รอบนี้ไม่มีรุ่น"; the "(i)" panel prints the reason under that group and after its rule; `?cluster=` for it by URL shows "รอบนี้ไม่มีรุ่นที่ตัวเลขตรงกับกลุ่ม “…”" with the reason, not the generic "ไม่พบสินค้า…". /ml lists per group "K-Means จัด N · ติดป้าย N · แสดงบนเว็บตอนนี้ N รุ่น" (the last = `countModelsByCluster`, the home page and /insights number) with a line on why they differ. |
| **ProductImage** | `product-image.tsx` (client) | Merchant image hot-linked at the variant `lib/images.ts` picks for its displayed size; `width`/`height` reserve the box; `priority` (first 4 cards, product hero) = eager + `fetchpriority="high"`, everything else lazy; `referrerPolicy="no-referrer"`; on load error, or no image, the category name in `.display` on `--surface-muted`. White box in both themes. Never proxied or stored. |
| **ProductCard** | `product-card.tsx` | Whole card is one link (`.card.card-interactive`, name underlines on hover, CTA inverts). Image (4:3, white, 3 px rule under it) with **DealTag top-left** and the black "หมดทุกร้าน" block top-right when sold out → meta → name (2 lines reserved) → **price `tabular text-[22px] sm:text-[26px] font-bold`** → "ราคายุติธรรม ฿x ± y%" (80% prediction interval, `formatBand`) whenever an in-stock fair price exists and is not `fairUncertain`, else "สูงสุด ฿max" → FairGapTag (uncertain: the orange "ประเมินไม่แน่นอน" chip plus the visible line `uncertainNote(bestPctVsFair)` ("ราคาจริงแพงกว่าราคายุติธรรม 42% โมเดลยังประเมินรุ่นนี้ได้ไม่ดี จึงไม่ใช้จัดอันดับดีล"), and no fair-price figure on the card, except inside the sentence of a sibling inversion (2026.11-v17, `uncertainNote(bestPctVsFair, cheapestReason)`: "ราคายุติธรรมของรุ่นนี้ (฿9,579) สูงกว่ารุ่นที่สเปกดีกว่า GeForce RTX 3050 8GB (฿8,328) โมเดล…", which quotes both models' fair prices as the comparison itself, without "± y%"); in stock with no fair price: the visible line `noFairPriceNote(cheapestReason)`, "ยังประเมินราคายุติธรรมไม่ได้ (สเปกในชื่อสินค้าไม่ครบ)" or, for a workstation CPU (2026.11-v19), "ซีพียูเวิร์กสเตชัน โมเดลไม่ประเมินราคายุติธรรม"), then `VerdictBadges` (recommendation + the model's demand group, then the card reason from `cardReason`, at most 2 lines, then the conflict note) → **CTA** `.btn-primary` "ดูราคา N ร้าน →" with N = stores in stock (`aria-hidden`, the card is the link; `.btn-secondary` "ดูราคาล่าสุด →" when sold out, where the price drops to a small "ราคาล่าสุด ฿x" and only the model's demand group chip shows). The fair price is never struck through or presented as a former price, and never shown without its ± band (the one exception: the two fair prices compared inside a sibling-inversion reason, see the uncertainty row of the copy glossary). Cards in a row are equal height (`h-full flex-col`, CTA `mt-auto`). SPEC round 16: whenever the model has a demand group (badge shown, withheld by a conflict rule, or sold out), `DemandEvidenceLine` follows the badges: the model's views and sales percentile, and one more short line when a number contradicts the group's name. When a conflict rule withholds the group badge, the card prints a single line instead (group name + numbers in brackets, plus a short suffix when a number contradicts the name; no "ไม่แสดงป้าย เพราะ…" note and no separate contradiction line), so it is no taller than its neighbours. All of it wraps only at spaces and `|` marks (`Words`), so nothing overflows or breaks mid-word on a 140 px card at 320 px. SPEC round 17: a model whose numbers do not support its K-Means group's name (`demand.labelFits === false`) has `modelCluster` null: no badge, no group text, only the numbers line; the contradiction lines of round 16 are gone from cards. |
| **DealTag / FairGapTag** | `badges.tsx` | DealTag: `.chip.caps` "DEAL n" in Space Mono; ≥ 70 solid green block, ≤ 30 solid red block, else a black chip. FairGapTag: "▼ ถูกกว่าราคายุติธรรม x%" as a green 2 px chip, or "▲ แพงกว่าราคายุติธรรม x%" as a black chip (never green); nothing under 0.5%. A block, not flex, with the "x%" `whitespace-nowrap` (and mono), so a wrap never splits the number. |
| **DealScore** | `badges.tsx` | Chip "Deal {n}" (mono); ≥ 70 green, ≤ 30 red, else black; `prominent` is larger. |
| **RecommendationBadge** | `badges.tsx` | Word-only chip: ซื้อเลย green, รอก่อน orange, ราคาเหมาะสม black. The reason text is a `title` tooltip in rows and a sentence in the product hero. |
| **ClusterBadge** | `badges.tsx` | Word-only chip in `--muted`; hint in `title` as an extra only (the hints are readable in the home "(i)" panel and on /insights). `max-w-full`, and on a narrow card the label wraps only at the space between its words (each word a nowrap span, never a break inside a Thai word), so it never overflows the card. The label's own break marks (`CLUSTER_LABELS[…].wrap`, e.g. ยอดขาย|ไม่เด่น) are honoured through `Words`. |
| **DemandEvidenceLine / Words** | `badges.tsx`, `lib/demand.ts` | `text-xs text-muted` evidence under a group badge, from `DemandEvidence` (`listing_insights.model_views`, `model_sales_beats_pct`, `model_normalized_price`, `demand_driver`; migration 0013, written by train from `model_demand`, read through `to_jsonb` so the page works before the migration). `Words` renders text whose Thai runs are nowrap spans and whose `|` marks are `<wbr>`. All wording and comparisons live in `lib/demand.ts` (pure): the yardsticks are the payload's `reference` medians (all clustered models) and `split_views`; nothing is recomputed in SQL or in the page. The per-model values are aggregated like the badge itself (`mode()` over the model's listings, `MODEL_EVIDENCE` beside `MODEL_CLUSTER`). The copy rules are checked by `npm run check:demand` (`web/scripts/check-demand.mjs`: plain Node, transpiles `lib/demand.ts` with the TypeScript already installed, asserts the strings); run it after changing `lib/demand.ts`. SPEC round 17: `lib/demand.ts` holds wording only. Whether the numbers support the name is the pipeline's `demand_label_fits` / `demand_label_miss` (migration 0014, `models.label_fit`); `SHOWN_CLUSTER` in `lib/queries.ts` is the one SQL expression for badge, filter, counts and product page, and `nameMismatch` / `cardConflict` no longer exist. The line takes `cluster` null for an unlabelled model. |
| **SoldOutTag** | `badges.tsx` | Black chip "○ หมด" / "○ หมดทุกร้าน". |
| **FairDelta** | `badges.tsx` | "▼ ถูกกว่าราคายุติธรรม x%" (good) / "▲ แพงกว่า… x%" (muted). Arrow + words, never colour alone. |
| **DealMeter** | `deal-meter.tsx` | Diverging bar: 14 px track with a 2 px border, a 3 px `--foreground` tick at the fair price, a `--good` block left when cheaper, `--bad` right when pricier, clamped at ±40%; label (mono) and fair price printed above; `role="img"` with a full-sentence label. |
| **Product hero** | `app/product/[id]/page.tsx` | `.card.card-heavy`, image left (3 px frame, ≤ 220 px on mobile), then name (h1, Archivo Black), "ราคาต่ำสุดตอนนี้" hero price at store, Deal + recommendation + the model's demand group (its only place on the page; also beside "หมดทุกร้าน" when sold out everywhere), DealMeter, reason, four stat tiles (2 px, sunken: ราคาสูงสุด, ประหยัดได้สูงสุด, จำนวนร้าน, มีของ). SPEC round 16: under the badges and the reason, `DemandEvidenceBlock` (3 px left rule): "กลุ่ม “…”:" + both numbers, then "ที่ได้กลุ่มนี้: …" measuring them against the typical model, or, when a number contradicts the group's name, "ตัวเลขของรุ่นนี้: …" leading with the contradiction, one plain reason line and a `<details>` ("ทำไมตัวเลขไม่ตรงชื่อกลุ่มได้") holding the K-Means note; then a `text-xs text-subtle` line on how the numbers are measured with a link to `/ml#kmeans`. Also shown when the model is sold out everywhere. SPEC round 17: `DemandBlock` picks `DemandEvidenceBlock` for a labelled model, or `UnlabelledDemandBlock` when K-Means grouped the model but its numbers do not support the name (numbers, the assigned group and the failing number, the reason line, the method in a `<details>`); nothing for a model without a group. |
| **OfferRow** | `app/product/[id]/page.tsx` | One `.card` per offer on a fixed 4-column grid (identity · price · DealMeter · verdict) so columns align; store name in `.display`; the listing title is a `.link` with "↗"; cheapest in-stock offer is `.card-heavy` with the green "ถูกที่สุด" chip (only with 2+ in-stock offers); sold-out rows on `--surface-muted` with "○ หมด" and no price verdict; no row shows a demand group (it is the model's, shown in the hero). Demand line under the title (glossary "Offer demand line"): each rate names how its store measures it, because IHAVECPU's stock drawdown and JIB's published sold count are not comparable (SPEC round 11); never "~0.00 ชิ้น/วัน". First 6 shown, the rest behind the secondary "ดูอีก N รายการ +" button. |
| **PriceChart** | `price-chart.tsx` (client) | Daily minimum per store; **monotone cubic** curves (smooth without overshooting a recorded price), black lines told apart by dash + marker (§3 Charts), a wash under the store that is cheapest today only, `--grid` hairlines with round THB ticks, 5 date ticks, crosshair + one `.tooltip` listing every store at the hovered day, text legend with the dash + marker key. |
| **Chart sizing** | `use-width.ts` | Charts measure their container (ResizeObserver) and draw a viewBox equal to the real width, so 12 px axis text stays 12 px on a phone (a fixed 760-unit viewBox shrank it to ~5 px). Narrow charts use fewer date ticks. |
| **SpecScatter** | `spec-scatter.tsx` (client) | Price vs one spec with the fitted SLR line; axes end at the 97.5th percentile with the hidden count printed; nearest-point hover (≤ 24 px) naming model, spec and price in a `.tooltip`. |
| **EffectBars** | `effect-bars.tsx` | Diverging horizontal bars of MLR effect (% per SD), sorted by magnitude, solid (raises) / outlined (lowers), value printed on every bar, "← ทำให้ถูกลง / ทำให้แพงขึ้น →" caption. |
| **Price ladder** | insights | Table per spec tier (2 px row rules): tier + model count, starting price (`.link` to the cheapest model), typical price, cheapest model (`.link`, sm+, Work Sans). |
| **Driver ranks** | insights | Rank in a black 24 px square, importance bar = `--foreground` fill in a 2 px bordered track. |
| **Segment tiles** | insights | `.card.invert-hover` links, name in `.display`, two 2 px stat tiles (values `whitespace-nowrap`: "~1 ชิ้น / N วัน" never wraps). |
| **StatNote** | `stat-note.tsx` (client) | `text-xs text-subtle` toggle `<button>` "text (i)" with `aria-expanded` / `aria-controls` (dotted underline; `py-3.5 -my-3.5`: 44 px hit area, no layout shift); opens a sunken 2 px panel (mono) under it with the full statistic. A button, not `<details>`, because it sits inside `<p>` sentences. The panel is server-rendered with `hidden`, so the text is in the HTML. Never `title` alone. |
| **Statistics link** | insights | `.card.invert-hover` link at the end of /insights to `/ml` (the former collapsed "รายละเอียดทางสถิติ" moved there, SPEC round 15). |
| **TreeDiagram** | `tree-diagram.tsx` (+ client `tree-scroll.tsx`) | Node-link tree from the payload's `tree.nodes`, drawn top-down at real size (12 px text): compact tidy layout (Reingold–Tilford contour packing; 172 px question boxes, 112 px leaves, ≥ 14 px between any two boxes on a row, parent midway between its children), so boxes never overlap. Inner nodes: sunken 2 px box, Thai split via `splitText` (`lib/ml.ts`, `featureLabel` + unit; GPU class as "≤ xx60 Ti / XT"; yes/no specs asked positively, "เป็น AMD?") and n. Every edge labelled from `EDGE_WORDS`: ใช่ always on the left and ไม่ใช่ on the right, for "≤" questions and yes/no specs alike (`yesNoChildren` puts a flag's > 0.5 child first; the text outline and the worked path use the same order; SPEC round 18). Price leaves: 3 px box, price in mono, a decorative top strip filled by log price from `--surface` toward `--foreground` (`color-mix`; no text on it), so it darkens in light mode and lightens in dark mode: never describe it as "เข้ม = แพง"; a legend under the tree draws the same fills, "แถบบนกล่องใบ: ถูก ▭▭▭▭▭ แพง (฿min → ฿max)". Class leaves: 3 px frame and label in the RecommendationBadge tone. Scrolls sideways inside its own bordered box (focusable, scrolled to the root on mount); when wider than the box (SPEC round 18), a visible cue on every screen: "ต้นไม้นี้กว้างกว่ากรอบ เลื่อนซ้ายขวาได้ …" with 44 px "← ซ้าย" / "ขวา →" `.btn-secondary` buttons (`aria-disabled` at an end, never `disabled`, so keyboard focus stays on the button; smooth scroll unless `prefers-reduced-motion`); the cue row is server-rendered and hidden by a container query when the box is at least as wide as the tree, so it causes no layout shift and a dashed left / right box edge on each side that still hides boxes (a border style, so it covers no box text; overlaid ◀ ▶ tabs covered text and were dropped); rendered after mount only. % thresholds print one decimal everywhere ("≤ +6.0%", "≤ 44.2%"); `role="img"` + `aria-label`; a `<details>` "ดูต้นไม้นี้เป็นข้อความ" holds the same tree as text. Payloads without `tree` show the old text rules with Thai feature names (`translateRules`), and the reading guide describes the indented text instead of boxes. |
| **Formula / ScrollTable** | `app/ml/page.tsx` | Formula: mono on a sunken 2 px block that wraps (`whitespace-normal break-words`), never a one-line scroller; plain-text formulas live in `lib/formula.ts` (`FORMULAS`) and are cut by `formulaUnits` into nowrap units joined by spaces: a Thai word is one unit (never "ต่ำ|สุด"), a math run of up to 26 characters is one unit, a longer one breaks only before an operator outside brackets or after a "),", and a "·" separator ends the unit before it. No character is ever dropped (`check:demand` asserts every formula; `Words` must not be used here, it drops "|" as in "(|A||B| …)") (SPEC round 18). ScrollTable: wide tables scroll inside `overflow-x-auto` with a visible "เลื่อนตารางไปทางขวาได้ →" cue below md. Section anchors use `lg:scroll-mt-40` to clear the sticky header. |
| **CategoryTabs** | `category-tabs.tsx` (client) | Filter-chip buttons (`aria-pressed`, 44 px) switching server-rendered panels (others `hidden`). |
| **ML charts** | `ml-charts.tsx` (client) | FitScatter (listed vs fair price, log axes, solid y = x, dashed ± the payload's `uncertain_gap`, omitted when absent, nearest-point tooltip; from 2026.11-v17 points flagged uncertain (4th member, a wide gap or a sibling inversion that may sit inside the dashes) are `--warn` crosses (`UncertainKey`) instead of hollow squares, with a legend entry and count, and the /ml worked example never picks one (`fitExample`)), ResidualHistogram (bins from the payload, 0 solid, ± `uncertain_gap` dashed), DemandScatter (marker shape per K-Means group, named like the web's badges: filled square, hollow square, hollow triangle, cross; models K-Means grouped but the web does not badge (points' 4th value false, 2026.11-v16+) in `--subtle` grey with a 1 px stroke under the others (≥ 3:1 on the chart surface in both themes, still fainter than the badged points), with a legend entry "สีจาง = …" and a count; v15 payloads say in text how many drawn models carry no badge; a name with no point says why (`emptyGroupReason`); numbered black diamonds = centroids; dashed best-seller views split; x ticks 10, 1k, 100k, 1M, never "1000k"), DendrogramChart (top 30 Ward merges; dashed cut "เส้นตัด k = n" with its own bold tick and height label on the y axis, the payload's `cut_height` to 2 decimals as /ml quotes it, midway between the merges leaving k and k − 1 clusters, y axis stretched around it when that gap is under 36 px with a note; numbered black squares 1..k where the cut crosses; each group's subtree below the cut on an alternating `--surface-muted` band), LinkageCurve (precision solid + squares, coverage dotted + triangles, chosen threshold long-dashed). Coordinates rounded to 0.01 px so server and browser render the same numbers; per-point style sits on the enclosing `<g>` to keep the HTML small. Every threshold quoted in /ml copy (uncertain gap, bin width, CV folds, max depth, timing horizon / drop / test share / accuracy bar) is read from the payload and left out when an older payload lacks it. |
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
   demand signals: `log_views` and the sales signal, `sales_rank_pct` = the
   within-store sales percentile from model 2026.11-v10, `log_sales_per_day`
   up to v9; `nvme` which `pcie_gen` already carries); the signed
   EffectBars (% per SD, Thai labels via `featureLabel`) live in the
   statistics section.
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
   ขายดี แต่คนดูน้อย; other clusters are คนดูเยอะ แต่ขายน้อย or the neutral
   remainder ยอดขายไม่เด่น (names: SPEC rounds 7, 17 and 18; the hint says
   what each is measured from and never repeats the name). Tiles count only
   models whose label fits their numbers (`countModelsByCluster` on
   `SHOWN_CLUSTER`), and the sales tile states the window ("ในช่วงที่ติดตาม (ไม่เกิน N วันล่าสุด)"). A line under
   the tiles says both are "ขายดีกว่าค่าเฉลี่ยชัดเจน" and prints the split
   ("คนดูมากกว่า N ครั้ง"), from `split_views`, and that the split separates
   only the two best-seller groups (the other groups are not divided by it,
   so their typical views can sit on either side of it).
5. **ป้าย ซื้อเลย / รอก่อน คิดจากอะไร** (`#advice`): while the tree is below
   its bar, the three rules as badge + sentence; the accuracy vs. 60% as a
   StatNote.
6. A link card to `/ml` (the statistics moved there in SPEC round 15).

#### 6.3a Behind the models (`/ml`, nav "เบื้องหลัง ML")

ISR like /insights. h1 + purpose + computed time, jump-link chips, the data
coverage table, then one section per method in this order: Simple Linear
Regression, Multiple Linear Regression, Regression Tree, K-Means, Hierarchical
(Ward), Decision Tree, record linkage. Every section has, in order: วิธีนี้ทำอะไร
(1–3 plain sentences + a mono formula block), a card "กราฟจากข้อมูลล่าสุด"
(per-category charts behind CategoryTabs), อ่านกราฟนี้อย่างไร (axes, marks,
lines, nodes, plus one worked example taken from the payload), ผลที่ได้บอกอะไร
(the payload's metrics with each term explained on first use, and the
limits). No number is written into the copy; all come from `market_insights`
(chart data from model 2026.11-v13; older payloads show a "กราฟจะขึ้นหลังระบบ
train รอบถัดไป" note or the text rules).

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
  filtered list shows that group: as the badge, or, when withheld, as the one
  line "กลุ่ม: … (คนดู N ครั้ง · ขายดีกว่า[แค่] N% (ติดตามไม่เกิน N วัน))" (SPEC round
  16). The sentence "รุ่นนี้อยู่ในกลุ่ม “…” แต่ไม่แสดงป้าย เพราะ…" is printed on
  the product page (hero and offer rows), not on cards.
- A group badge needs its own numbers behind it (SPEC round 17). K-Means
  groups on views, sales and price at once, so a model can be put in a group
  whose name its views or sales contradict. The pipeline checks every
  clustered model against its group's name (`models.label_fit`, on the
  numbers as printed: sales share ≥ / < the 50% bar `LABEL_SALES_BAR`, views
  against `split_views` for the two best-seller groups or the all-model
  median for คนดูเยอะ แต่ขายน้อย; the neutral remainder fits only under the
  sales bar from model 2026.11-v16, SPEC round 18, and always before) and
  stores `demand_label_fits` / `demand_label_miss` (migration 0014) plus the
  thresholds and counts in the payload (`label_rule`, `unlabelled`,
  `segments[].labelled`). The web never re-evaluates the rule. Where the
  flag is false the model has no badge on cards or the product hero, is not
  returned by `?cluster=`, and is not counted on chips or /insights tiles
  (`SHOWN_CLUSTER`); its card shows only the numbers, and its product page
  says which group K-Means assigned and why no badge is shown. Where the
  flag is NULL (before migration 0014 / model 2026.11-v15) the badge shows
  as before. No card ever prints a "numbers contradict the group" line.
- Fair-price uncertainty (`fair_uncertain`, migration 0012): a listing priced
  more than 40% away from its fair price shows the amber "ประเมินไม่แน่นอน"
  tag instead of DEAL / "▼ ถูกกว่า", a DealMeter without a bar, no
  recommendation, and is never ranked as a deal (its Deal Score is null).
  Its explanation quotes that listing's real direction and gap
  ("ราคาจริงแพงกว่าราคายุติธรรม 42%"), never the 40% threshold.
  Its card hides the fair-price figure (the product page keeps it with the
  explanation). Every other fair price carries "± y%", the half-width of its
  80% interval. From model 2026.11-v17 (SPEC round 19, user's option B) a
  model is also flagged when a sibling in its line that is at least as good
  on every compared spec has a fair price more than `sibling_tolerance` (5%)
  lower; only that lesser model is flagged, and its explanation names the
  sibling and both fair prices instead of the gap. /insights (MLR (i) detail)
  and /ml (MLR results) quote the pair count and 1-3 example pairs from the
  payload, and say nothing about siblings for older payloads.
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
  จึงยังสรุปไม่ได้ว่าถูกกว่าตลาดจริง". Deal 21–79 (2026.11-v11, `mid_score_reason`):
  "ราคาใกล้เคียงราคายุติธรรมของสเปกนี้" only when the shown gap is under 5%; from
  5% on, the same gap-and-band sentence as above (e.g. "ถูกกว่าราคายุติธรรม 18%
  แต่ยังอยู่ในช่วงคลาดเคลื่อน ±30% จึงยังสรุปไม่ได้ว่าถูกกว่าตลาดจริง"), or, when the
  gap already clears the band, "ถูกกว่าราคายุติธรรม 50% ซึ่งเกินช่วงคลาดเคลื่อน ±20%
  แต่ Deal Score ยังไม่ถึงเกณฑ์ซื้อเลย (Deal Score 80 ขึ้นไป)" (รอก่อน: "(Deal Score 20 ลงมา)").
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
  (why a high DEAL is not ซื้อเลย), "ใกล้เคียงราคายุติธรรม" (0%, or Deal 21–79 under 5%, as the pipeline reason),
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
- The product list and product pages read the K-Means yardsticks through `getDemandPayload` (five keys of the
  payload, `unstable_cache` for 900 s), so the dynamic list adds no database round trip per request. The
  per-model numbers are read live while these yardsticks can be up to 15 minutes old, so for a short time
  after a training run a card may be compared with the previous run's medians and split (the model's own
  numbers are always the current run's; only the comparison wording can lag).
- No `<Suspense>` around server-rendered page content whose data is already awaited (tried on the product list
  in SPEC round 16 and reverted): on a production build React then streams the content as a pending boundary,
  the cards arrive in a hidden `<div id="S:…">` after the footer and only JavaScript reveals them, which breaks
  the no-JS page, SEO and LCP. The cards must be in `<main>` in the first HTML.
- Client JS is limited to `PriceChart`, `SpecScatter`, `AutoSubmitSelect` and
  the /ml charts, tabs and tree scroller;
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


