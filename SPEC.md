# SPEC: ความไม่แน่นอนของราคายุติธรรม (model 2026.11-v4)

## เป้าหมาย
ดีลเด็ด 60 อันดับต้องไม่ถูกครอบงำด้วยราคายุติธรรมที่โมเดลประเมินสูงเกินจริง และผู้ใช้ต้องเห็นว่าราคายุติธรรมแต่ละตัวคลาดเคลื่อนได้แค่ไหน

ที่มา (วิเคราะห์ข้อมูลจริง 2026-11-12): 98% ของ "ส่วนลด" ใน 60 อันดับเป็นส่วนต่างระดับรุ่น (ทุกร้านต่ำกว่า fair เท่ากัน) ไม่ใช่ดีลของร้าน; กลุ่มที่ประเมินสูงเกินคือ CPU/GPU รุ่นก่อน 2022, SSD NVMe ≥2TB / SATA, แบรนด์ budget (ADATA, Hiksemi, Kingston SSD, Corsair RAM)

## ขอบเขต
งานนี้ถูก implement แล้วใน commit `c1ff99c` (Python pipeline, migration 0012, เว็บ) แต่ **CI ล้ม** ต้องแก้ให้ผ่าน และตรวจว่าทำครบตามเกณฑ์ด้านล่าง
ไม่อยู่ในขอบเขต: เปลี่ยน feature ของโมเดล, เพิ่มแบรนด์เป็น feature, เปลี่ยนเกณฑ์ Deal Score 80/20

## เกณฑ์ผ่าน (acceptance criteria)
1. `uv run pytest -q`, `uv run ruff check src tests`, `uv run ruff format --check src tests`, `uv run mypy src` ผ่านทั้งหมด รวมถึง integration test ที่ต้องใช้ Postgres (`tests/test_db_integration.py`, รันใน CI ด้วย service postgres) — ปัจจุบัน `test_train_persists_insights` ล้มด้วย `assert 0 == 60` ที่ assert `deal_score BETWEEN 0 AND 100` (เขียนครบ 60 แถว แต่ fixture 3 สินค้าทำให้ทุกแถวถูก flag uncertain จึงไม่มี Deal Score)
2. Pipeline: listing ที่ |ราคา / fair − 1| > 0.40 → `fair_uncertain = true`, `deal_score` = NULL, `recommendation` = NULL, `recommendation_reason` = ข้อความ "ประเมินไม่แน่นอน: …"; `fair_price` ยังเก็บไว้
3. Pipeline: ทุก listing ที่มี fair price มี `fair_error_pct` > 0 = ครึ่งความกว้างช่วงคาดการณ์ 80% (sinh(1.2816·s·√(1+h)))
4. Migration `0012_fair_uncertainty.sql` เพิ่มคอลัมน์แบบ additive และ apply ซ้ำไม่ได้ (ระบบ migration กันอยู่แล้ว)
5. เว็บ: การ์ดและ Hero แสดง "ราคายุติธรรม ฿X ± Y%" (ไม่ขีดฆ่า); รายการ uncertain แสดงป้าย "ประเมินไม่แน่นอน" ไม่มี DEAL tag / "▼ ถูกกว่า" / แถบสีเขียว
6. เว็บ: รายการ uncertain ไม่ติด 60 อันดับเรียง "ดีลดีที่สุด" และไม่เป็น Deal of the week
7. `cd web && npx tsc --noEmit && npx eslint src` ผ่าน
8. ไม่แตะไฟล์ที่ไม่เกี่ยวข้อง: `design.md`, `questui-DESIGN.md`, `.agents/`, `.claude/skills/*` (9arm), `skills-lock.json`
