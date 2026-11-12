# Progress Log

> หัวหน้าทีมต่อท้ายไฟล์นี้ทุกรอบ ใช้สรุปให้ผู้ใช้อ่านตอนเช้า

รูปแบบแต่ละรอบ:
```
### รอบที่ N (YYYY-MM-DD HH:MM)
- งาน: ...
- ผล: DONE / BLOCKED / IDLE
- แก้ไปกี่รอบ: n
- สิ่งที่เปลี่ยน: ไฟล์และสรุปสั้นๆ
- Decisions: ตัดสินใจอะไรไปเองบ้าง เพราะอะไร
```

## Log

### คืน 2026-11-12 → 13 (ผู้ใช้สั่ง "มีบั๊กให้แก้เลย ไม่ต้องถาม")
- รอบ 10 เว็บล่มจาก EMAXCONNSESSION: runtime ใช้ transaction pooler 6543 + max_pipeline 0, idle 5s, ปิด prefetch, error page — DONE (f4206d3), 90 concurrent requests ไม่มี 5xx
- รอบ 11 UI เล็ก 10 ข้อ (ตัวเลขสเปก, แถวร้านภาษาไทย, (i) แตะได้, hint ภาษาง่าย, 320px, nav fallback, global-error) — DONE (1c855f9)
- รอบ 12 MLR ใช้อันดับยอดขายในร้านแทนผลรวมชิ้น/วัน (v10) — DONE (b4ac54d)
- รอบ 13 เหตุผล "ใกล้เคียง" เฉพาะส่วนต่าง < 5%, ข้อความ uncertain เป็นกลาง, hero กรองราคายุติธรรมเกินราคาสูงสุดที่เคยเห็น (v11) — DONE (612e8d1)
- รอบ 14 ข้อความ uncertain บอกทิศทาง+ตัวเลขจริง, hero แสดง DEAL และราคาสูงสุด 120 วัน, ป้ายกลุ่มที่ 320px (v12) — DONE (28f2bce)
- Decisions: ไม่แตะ Vercel project settings (git auto-deploy ล้มทุก push) และไม่แก้โครงสร้าง MLR เรื่องรุ่นพี่น้องกลับด้าน — รอผู้ใช้ตัดสินใจ (อยู่ใน backlog)
