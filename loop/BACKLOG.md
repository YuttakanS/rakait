# Backlog

> หัวหน้าทีมเป็นผู้ดูแลไฟล์นี้ ผู้ใช้เพิ่มงานลง `## Ready` เองได้ทุกเมื่อ (งานบนสุดจะถูกทำก่อน)

รูปแบบงาน:
```
- [ ] ชื่องาน (ขนาด S/M/L)
  - เกณฑ์ผ่าน: 1) ... 2) ... 3) ...
```

## Ready

- [ ] **Round 17 follow-ups (live user-test ACCEPT, model 2026.11-v15)**
  1. Waiting on the user: the "ไม่เด่นทั้งคนดูและยอดขาย" label still appears on models that outsell ≥ 50% of the store (about 14 of 157, e.g. WD SN7100 2TB at 94%). Proposal: label the leftover group only below the 50% sales bar and show the rest unlabelled like the other 9 models. Also fix the sentence "ชื่อกลุ่มจึงไม่ได้อ้างตัวเลขใด" in the (i) panel, on /ml and on the product page.
  2. Hydration error #418 on production list pages: 5 in about 110 loads on v15, 0 in 100+ on the round-16 deploy.
     - Server HTML is correct. The mismatch is at `div.flex` around `AutoSubmitSelect`, under `<section products-title>`.
     - Do NOT wrap page content in Suspense: it moved the cards out of the first HTML.
     - Start from the header Suspense (HeaderSearch / SiteNav with useSearchParams).
  3. The demand payload cache (15 minutes) mixes new numbers with old wording after a train. Revalidate on train or deploy.
  4. /insights tiles show the mean sales share ("~17%") while the list shows the median ("เกินครึ่งยังไม่เห็นยอดขาย"). Use one statistic or label the mean.
  5. The group comparison line has two stacked parentheses and takes 4 lines at 375px. Merge them when the group and all-model texts are the same.
  6. Check that "ขายดีกว่าแค่ N%" also applies on unlabelled cards (G.Skill DDR4 8GB 44%, Lexar NM620 46%).
- [ ] **Longer history without extra load on stores** (ideator research 2026-11-13)
  - Use the listing month embedded in IHAVECPU `sku` and IT City `PRD` codes for `days_listed`, after validating against data.
  - Store IT City "คงเหลือ N รายการ" and "ราคาปกติ", and IHAVECPU `price_before`.
  - Ask the user: email the stores for permission and history. BaNANA's terms forbid storing or copying content without written consent.
  - Not worth doing: a JIB Wayback backfill before 2024. archive.org returned 429 on 149 of 158 requests, coverage is sparse and there are no sold counts before Aug 2025.

- [ ] **/ml copy follow-ups from the round-15 live user-test (ACCEPT)**. Fix items 1 and 2 before the course presentation:
  1. K-Means centroid 4 is labelled "คนดูน้อย ขายน้อย" but sits at about 35k views and about 55% sales rank. Say which dimension separates it (normalized price, the third dimension), using the centroid value from the payload.
  2. Decision Tree "อ่านกราฟ": describe the features that are actually in the tree (e.g. "ราคาเทียบอดีตของร้านนี้ ≤ 44%" is a historical price percentile), not "ราคาเทียบค่ากลางของรุ่น". Explain the "ซื้อเลย n=13, 8%" leaf, which comes from balanced weighting. Fix the typo "ใบใบ".
  3. K-Means copy:
     - "คนดูน้อย" at 8,329 views: say it is low relative to the median from split_views.
     - Remove the repeated sentence and add the missing space at "1 ถึง 4สี่เหลี่ยม…".
     - Explain the horizontal band of points at about 30% (tied sales ranks).
     - Show the x-axis as "1M" instead of "1000k".
  4. Regression tree in dark mode: the copy says "แถบเข้ม = แพง", but in dark mode the most expensive leaf is white. Add a cheap→expensive legend or neutral wording.
  5. Edge direction differs: ≤ questions put "ใช่" on the left, flag questions put "ใช่" on the right. Consider always placing "ใช่" on the left.
  6. Dendrogram: add a tick at the cut height.
  7. Page weight: the HTML is 864 KB raw (96 KB gzip) with 5.4k DOM nodes. Consider rendering only the selected category.
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

- [ ] **ต้องให้ผู้ใช้ตัดสินใจ:** ราคายุติธรรมกลับด้านในรุ่นพี่น้อง (RTX 3050 6GB ฿10,072 > 8GB ฿7,935; RX 9060 XT 8GB > 16GB; 5070 Ti > 5080; 9070 XT ฿48,647 vs 9070 GRE ฿16,611; 9800X3D ฿11,981 vs 9950X3D ฿42,109) ทางเลือก: monotonic constraint (VRAM/tier), แยกโมเดลตามสถาปัตยกรรม, หรือเตือนเมื่อพี่น้องกลับด้าน (L)
- [ ] GPU: ลองตัด feature ยอดขายออกจาก MLR (no-sales variant R²cv .940 vs .925) (S)
- [ ] /insights "อะไรทำให้ราคาแพงขึ้น": "เป็น DDR5 ▼ ราคาต่ำกว่า" ต้องบอกว่าเทียบที่ความเร็วเท่ากัน; ตารางสัมประสิทธิ์แสดง featureLabel คู่ชื่อดิบ (S)
- [ ] Vercel git integration สร้าง deployment ที่ล้ม ("Couldn't find any pages or app directory") ทุกครั้งที่ push เพราะ build จาก root ของ repo: ปิด auto-deploy จาก git หรือตั้ง Root Directory = web (ระวัง: ถ้าเปิดให้ deploy อัตโนมัติจะชนกับลำดับ deploy เว็บก่อน train) — ต้องให้ผู้ใช้ตัดสินใจ (S)

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
