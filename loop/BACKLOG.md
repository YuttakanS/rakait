# Backlog

> หัวหน้าทีมเป็นผู้ดูแลไฟล์นี้ ผู้ใช้เพิ่มงานลง `## Ready` เองได้ทุกเมื่อ (งานบนสุดจะถูกทำก่อน)

รูปแบบงาน:
```
- [ ] ชื่องาน (ขนาด S/M/L)
  - เกณฑ์ผ่าน: 1) ... 2) ... 3) ...
```

## Ready

- [ ] **Round 19 follow-ups (live, model 2026.11-v17)** (S)
  1. Sibling reason on mobile cards is 6–9 lines at 375/320px when the model name is long (2-column grid, 108–136px text). Consider dropping the "โมเดลยังประเมินรุ่นนี้ได้ไม่ดี จึงไม่ใช้จัดอันดับดีล" tail on cards only (the chip says it); keep the full sentence on the product page.
  2. /insights siblingSentence: "…เกิน 5% 3 คู่" puts two numbers side by side, write "…เกิน 5% รวม 3 คู่"; "ไม่ดีกว่า…เลยสักด้าน" reads as a double negative, use the /ml wording "ด้อยกว่าหรือเท่ากับอีกรุ่นทุกด้าน" on both pages.
  3. `fitExample` falls back to all points (possibly flagged) when none are trusted, contradicting the "never a flagged listing" comment; return null (hide the example) instead, or fix the comment.
  4. FitScatter tooltip does not say a point is "ประเมินไม่แน่นอน".
- [ ] **Round 21: CPU fair prices too high for high-thread Ryzen → fake top CPU deals** (M, user-tester round 20). Live v18: the top CPU deals are Ryzen 9 9900X3D ฿22,090 vs fair ฿32,517 (DEAL 86), Ryzen 7 8700F ฿6,690 vs ฿9,836 (85), Ryzen 9 9950X ฿20,990 vs ฿30,463 (84); 9950X3D fair ฿46,185 vs market ฿25–27k (unscored). Suspect `log2_threads` β +0.597 dominating once unlocked/demand were dropped. Also 8500G fair > 7600 (cross-generation, not a sibling).
  - เกณฑ์ผ่าน: 1) these listings get believable fair prices or are flagged 2) CPU R²(cv)/MAPE(cv) not worse than v18 (.883 / .224) 3) inversions not worse than v18 (6) 4) GroupKFold + random-split evidence as in round 20.
- [ ] **Round 20 follow-ups** (S)
  1. Parser reads "9950X3D2" as unlocked=False, so the sibling check treats 9950X3D as the better part (v18 fair: X3D2 ฿39,684 < X3D ฿46,185). Treat X3D2 as X (and ≥ X3D).
  2. Explain on /ml and the product page that the CPU fair price ignores the K/X unlock premium and that the CPU MLR has no demand features (the MLR copy on /ml says views/sales rank are used, which is false for CPU since v18).
  3. /ml CPU tree node "ระดับรุ่น (Ryzen / Core) ≤ 6 (เช่น R6, i6)?" names tiers that do not exist; describe the threshold between real tiers (e.g. "Ryzen 5 / Core i5 หรือต่ำกว่า").
  4. 8500G product page shows "Deal 85" together with "ราคาเหมาะสม" and "สรุปไม่ได้ว่าถูกกว่าตลาดจริง" — reads as contradictory.
  5. `unlocked` regex misses "XE" (i9-7980XE → False); only affects sibling dominance now.
  6. scrape.yml runs train with `!cancelled()` even when link fails, so a link failure trains on stale specs.
- [ ] **Round 18 follow-ups (live, model 2026.11-v16)**
  1. Hydration error #418 on production list pages (5 in ~110 loads on v15). Server HTML is correct; mismatch at `div.flex` around `AutoSubmitSelect` under `<section products-title>`. Do NOT wrap page content in Suspense. Start from the header Suspense (HeaderSearch / SiteNav with useSearchParams).
  2. The demand payload cache (15 minutes) mixes new numbers with old wording after a train. Revalidate on train or deploy.
  3. /ml at 320px: SLR "n = ⏎ 430", Deal Score "= 100 ⏎ ×", Gini "(0 = ⏎ …)" line breaks; the SLR formula with numbers is JSX and bypasses `formulaUnits`.
  4. A demand chip whose payload has labelled models but whose live count is 0 links to an empty state that blames the numbers (wrong cause).
  5. Presentation questions: /insights says "เป็น DDR5 ▼ ราคาต่ำกว่า" while the RAM regression tree prices DDR5 higher; the RAM tree has a leaf "DDR4 > 5,000 MHz → ฿1,329" (n=10), probably odd data.
- [ ] **Longer history without extra load on stores** (ideator research 2026-11-13)
  - Use the listing month embedded in IHAVECPU `sku` and IT City `PRD` codes for `days_listed`, after validating against data.
  - Store IT City "คงเหลือ N รายการ" and "ราคาปกติ", and IHAVECPU `price_before`.
  - Ask the user: email the stores for permission and history. BaNANA's terms forbid storing or copying content without written consent.
  - Not worth doing: a JIB Wayback backfill before 2024. archive.org returned 429 on 149 of 158 requests, coverage is sparse and there are no sold counts before Aug 2025.

- [ ] /ml page weight: the HTML is 864 KB raw (96 KB gzip) with 5.4k DOM nodes. Consider rendering only the selected category.
- [ ] ตรวจ UX/UI ทั้งเว็บเทียบกับ `.claude/skills/design.md` แล้วแตกปัญหาที่พบเป็นงานย่อยใน Ready เรียงตามความรุนแรง (M)
  - เกณฑ์ผ่าน: 1) user-tester เดินผ่านทุกหน้าหลักอย่างน้อยบนจอเดสก์ท็อปและมือถือ 2) ทุกปัญหาที่พบถูกเขียนเป็นงานพร้อมเกณฑ์ผ่าน 3) งานนี้ไม่แก้โค้ดใดๆ

- [ ] การ์ด: ย้ายเหตุผลไปติดใต้ป้ายคำแนะนำ และแก้ป้าย "กระแสแรง ขายไม่ออก" ที่เกินขอบการ์ดที่ 375px (S)
  - เกณฑ์ผ่าน: 1) บรรทัดเหตุผลอยู่ติดใต้ป้ายคำแนะนำ ไม่มีป้าย cluster คั่น 2) ที่ 375px ไม่มีป้ายใดเกิน padding ของการ์ด 3) การ์ดในแถวยังสูงเท่ากัน
- [ ] เหตุผลบนการ์ดกับหน้าสินค้าใช้คำเดียวกัน และเมื่อตัวเลขเท่ากันพอดี (เช่น 38% กับ ±38%) ให้เขียนว่า "ยังไม่เกินช่วง" (S)
  - เกณฑ์ผ่าน: 1) ส่วนต่าง < 0.5% ทั้งการ์ดและหน้าสินค้าเขียน "ใกล้เคียงราคายุติธรรม" 2) กรณีเท่ากันพอดีมีคำว่า "ยังไม่เกิน"
- [ ] ตรวจว่าทำไม Ryzen 9 9900X3D / Core i7-12700KF ได้ "ยังประเมินราคายุติธรรมไม่ได้ (สเปกในชื่อสินค้าไม่ครบ)" ทั้งที่ชื่อและตารางสเปกมี Cores (M)
  - เกณฑ์ผ่าน: 1) หาสาเหตุใน parser/linking 2) แก้แล้ว CPU ที่ชื่อมีจำนวนคอร์ได้ราคายุติธรรม หรือข้อความบอกเหตุผลที่ถูกต้อง
- [ ] เพิ่ม test runner ฝั่งเว็บ (`node --test` หรือ vitest) แล้วย้ายเทสต์ `cardReason` 18 กรณีเข้า repo (S)

- [ ] Tooltip กราฟ (price-chart, spec-scatter) ใส่ `w-max` ให้ความกว้างไม่ถูกบีบตามตำแหน่ง แล้วเอา deps ของ layout effect ใน `use-tooltip-left.ts` ออก และใส่ return type ให้ `useTooltipLeft` (S)
  - เกณฑ์ผ่าน: 1) ชี้จุดกลางค่อนขวาแล้ว tooltip ไม่ถูกบีบจนชื่อรุ่นขึ้นหลายบรรทัด 2) ยังอยู่ในกรอบที่ 375px
- [ ] มือถือ: แถบหมวดหมู่ที่เลื่อนได้ต้องมีสัญญาณว่าเลื่อนต่อได้, ป้าย ซื้อเลย/ราคาเหมาะสม ต้องดูต่างจากปุ่ม, "(i)" ต้องแตะหรือใช้คีย์บอร์ดเปิดได้ (M)

- [ ] Navbar มือถือ: เลื่อนแถบหมวดไปให้เห็นแท็บที่ active เอง, ไฮไลต์หมวดของสินค้าในหน้า /product, ตัด "ภาพรวมตลาด" ที่ซ้ำในหัวเว็บ (S)
- [ ] ผลว่างเมื่อกรองหมวดร่วมกับกลุ่ม (เช่น การ์ดจอ + ช้างเผือก = 0) ต้องมีปุ่ม "ดูกลุ่มนี้ทุกหมวด" / "ล้างหมวด" (S)
- [ ] Hydration error #418 ที่กริดสินค้าใน dev เมื่อกดย้อนกลับ (เกิดราว 5/10 ครั้ง มีมาก่อนรอบ 5) (M)

- [ ] Suspense fallback ของ navbar ไฮไลต์ "หน้าแรก" ใน HTML แรกที่ stream มา ก่อนสลับเป็นหมวดจริง ให้ fallback ไม่ไฮไลต์อะไรเลย (S)

- [x] (เสร็จรอบ 8) กรองกลุ่มความต้องการแล้ว ป้ายบนการ์ดต้องตรงกับกลุ่มที่กรอง: ตอนนี้กรองจาก "มีร้านไหนก็ได้อยู่ในกลุ่ม" แต่ป้ายบนการ์ดมาจากร้านที่ถูกที่สุด (6/13 การ์ดขวัญใจชุมชนไม่มีป้าย และรุ่นเดียวโผล่หลายกลุ่ม) ต้องตัดสินว่าจะกำหนดกลุ่มระดับรุ่นหรือระดับร้าน (M)
- [ ] เมื่อกรองกลุ่ม หัวข้อหรือบรรทัด "พบ X รุ่น" ต้องบอกชื่อกลุ่มด้วย, /insights ต้องใช้หน่วย "รุ่น" ให้ตรงกับหน้าแรก (หรือเขียน "14 รายการ (12 รุ่น)"), "~1 ชิ้น / 1 วัน" ห้ามขึ้นบรรทัดใหม่, การ์ดที่หมดทุกร้านต้องแสดงป้ายกลุ่ม (S)

- [ ] คำอธิบายกลุ่มให้เป็นภาษาคนซื้อ (เลี่ยง "มัธยฐาน", "บ่งบอก") เช่น "คนเข้าดูเยอะ แต่ขายได้น้อยกว่าที่ควร", "ทั้งคนดูและยอดขายต่ำกว่าค่าเฉลี่ย", และเรียงชิป "ขายดี คนดูเยอะ" ก่อน "ขายดี แต่คนดูน้อย" (S)
- [ ] ที่ 320px มี scroll แนวนอนทุกหน้าจากเมนูหัวเว็บและช่องค้นหา (S)

- [ ] /insights (ISR 15 นาที) ค้างข้อมูลเก่าหลัง train: ให้ train สั่ง revalidate (on-demand revalidation) หรือลด revalidate และแสดง "คำนวณล่าสุด" ให้ตรงกับรอบ train (S)
- [ ] กลุ่มที่มีเกิน 60 รุ่นต้องมีปุ่ม "ดูเพิ่ม" หรือแบ่งหน้า (M)
- [x] (เสร็จรอบ 9) ตรวจยอดขายต่อวันของกลุ่มขายดี (~30 ชิ้น/วัน ต่อรุ่น หลังรวมทุกร้านใน v8): ร้านไหนส่ง sales_per_day สูงผิดปกติ (S)
- [ ] หน้าสินค้า: สเปกแสดงเลขทศนิยมยาว (Base clock 3.5999999999999996), แถวร้านใช้คำว่า "views" และ "~0.00 ชิ้น/วัน" (S)

- [x] (เสร็จรอบ 10) เว็บล่ม (HTTP 500) เป็นช่วงๆ จาก `EMAXCONNSESSION max clients reached in session mode (pool_size 15)` ของ Supabase เกิดช่วง deploy ติดกันหลายครั้ง + prefetch หน้าสินค้า ~12 หน้าพร้อมกัน: จำกัด pool ต่อ instance (max 1-2), ปิด/ลด prefetch ของลิงก์สินค้า หรือแยก connection string สำหรับ build กับ runtime (transaction pooler 6543 สำหรับ runtime; เคยทำ prerender ค้าง) (M, ด่วน)
- [ ] "(i)" และ hint ของกลุ่มต้องใช้บนมือถือได้ (แตะแล้วเห็น), ภาษา hint ง่ายขึ้น, การ์ด /insights แสดงมัธยฐานยอดวิวแทนค่าเฉลี่ย (กลุ่ม "คนดูน้อย" ค่าเฉลี่ย 18,339 สูงกว่าเส้นแบ่ง 18,149) (S)
- [x] (เสร็จรอบ 12) `demand_features` ใน MLR (ราคายุติธรรม / Deal Score) ยังรวมชิ้น/วันข้ามร้าน ใช้อันดับภายในร้านแบบรอบ 9 หรือตัดออกแล้วเทียบ CV MAPE (M)

- [x] (ตัดสินแล้ว: ตรวจหาแล้วติดป้ายฝั่งด้อย รอบ 19; ต้นเหตุ CPU = รอบ 20) ราคายุติธรรมกลับด้านในรุ่นพี่น้อง (RTX 3050 6GB ฿10,072 > 8GB ฿7,935; RX 9060 XT 8GB > 16GB; 5070 Ti > 5080; 9070 XT ฿48,647 vs 9070 GRE ฿16,611; 9800X3D ฿11,981 vs 9950X3D ฿42,109) ทางเลือก: monotonic constraint (VRAM/tier), แยกโมเดลตามสถาปัตยกรรม, หรือเตือนเมื่อพี่น้องกลับด้าน (L)
- [ ] GPU: ลองตัด feature ยอดขายออกจาก MLR (no-sales variant R²cv .940 vs .925) (S)
- [ ] /insights "อะไรทำให้ราคาแพงขึ้น": "เป็น DDR5 ▼ ราคาต่ำกว่า" ต้องบอกว่าเทียบที่ความเร็วเท่ากัน; ตารางสัมประสิทธิ์แสดง featureLabel คู่ชื่อดิบ (S)

- [ ] React hydration error #418 (args HTML) เกิดเป็นบางครั้งบนหน้ารายการ (/?sort=stores, /?category=cpu&sort=price) น่าจะมีข้อความที่ขึ้นกับเวลา/ISR ระหว่าง server กับ client ต่างกัน (เช่น "อัปเดตล่าสุด", วันที่ภาษาไทย) (M)
- [ ] "สูงสุดที่เคยเห็นใน 120 วัน ฿X" ใน hero หาในกราฟไม่เจอ (กราฟแสดงราคาต่ำสุดต่อวัน) และไปตรงกับ "ราคาสูงสุด (มีของ)" ในหน้าสินค้า: ใช้คำเดียวกันทั้งสองที่ หรือแสดงเส้นสูงสุดในกราฟ (S)
- [ ] การ์ด "ประเมินไม่แน่นอน" บอก % แต่ไม่บอกราคายุติธรรม; หน้าสินค้าพูด "ราคาจริงแพงกว่า N%" ซ้ำสองครั้ง; ป้าย "ราคาสูงสุด (มีของ)" ตัดกลางวงเล็บที่ 320px (S)

## Ideas
(ไอเดียดิบจาก ideator / user-tester ที่ยังไม่ได้เขียนเป็นงาน)
- คำศัพท์บนเว็บยังเป็นภาษาเทคนิค ("ส่วนต่าง", "ช่วงคลาดเคลื่อน", และใน /insights มี "train", "ความแม่นของโมเดล 49%")
- ที่ 375px ชื่อ RAM ถูกตัดจน MHz หาย ทำให้การ์ดสองรุ่นดูเหมือนกัน
- /insights แสดง cluster แค่ 3 กลุ่ม (ไม่มี "ขวัญใจชุมชน") และ "ช้างเผือก" บอกว่ายอดเข้าชมน้อยแต่เฉลี่ย 38k มากกว่า "เฉพาะกลุ่ม"
- ยังไม่เคยเห็นการ์ด "รอก่อน" แบบมีของบนเว็บจริง ตรวจด้วยสายตาเมื่อมีข้อมูล

## Blocked
(งานที่แก้ 3 รอบแล้วไม่ผ่าน พร้อมเหตุผล ให้มนุษย์ตรวจตอนเช้า)

## Done
(บรรทัดเดียวต่องาน)
- รอบ 20 (2026-11-14, 15f8f12, model v18): CPU MLR + has_igpu, ตัด base clock / unlocked / demand (สัมประสิทธิ์ติดลบ); parser: Threadripper/Core X ไม่มี iGPU; CPU R²cv .851→.883, คู่กลับด้าน 19→6; ผู้ใช้เลือกคง has_igpu
- รอบ 19 (2026-11-13, fa93d09, model v17): รุ่นสเปกด้อยที่ราคายุติธรรมสูงกว่ารุ่นพี่น้องเกิน 5% ติด "ประเมินไม่แน่นอน" พร้อมเหตุผลอ้างรุ่นคู่ (ผู้ใช้เลือกติดฝั่งเดียว) GPU 3 / CPU 19 / RAM 1 / SSD 1 คู่; deal of the week เลิกเป็น RTX 3050 6GB
- รอบ 18 (2026-11-13, 5f279a1, model v16): /ml พร้อมนำเสนอ (centroid, Decision Tree, legend, ใช่ซ้าย, dendrogram, สูตรครบ, ปุ่มเลื่อนต้นไม้), กลุ่มที่เหลือชื่อ "ยอดขายไม่เด่น" ติดป้ายเมื่อขายดีกว่า < 50%, ชิปกลุ่มว่าง, จำนวนรุ่นตรงกันทุกหน้า, /insights ใช้มัธยฐาน; ปิด Vercel git auto-deploy (1ac51e0)
