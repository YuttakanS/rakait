# CLAUDE.md - Project Specification & Developer Directives

## 1. Project Overview & System Architecture
An end-to-end IT Hardware Price Comparison & Market Intelligence Platform targeting top Thai electronics retailers (IHAVECPU, JIB, BaNANA, IT City).
The platform leverages resilient Web Scraping, Structured Normalization, and Foundational Machine Learning Algorithms to deliver actionable consumer transparency: Fair Market Value estimation, Buy/Wait decision paths, Stockout risk warnings, and Demand clustering (Views vs. Actual Purchases).

### High-Level Architecture
- **Scraping Layer**: Python (`asyncio`, `playwright`, `httpx`, or `scrapy`) with rate-limiting, randomized backoff, and robust DOM selectors.
- **Data Normalization & Record Linkage**: Token-based parsing + Rule-based Regex + Vector Similarity to match heterogeneous merchant SKUs to canonical silicon models.
- **Machine Learning & Analytics Layer**: Academic ML pipeline using `scikit-learn` and `numpy`:
  - Simple Linear Regression & Multiple Linear Regression
  - Decision Trees (Classification & Regression)
  - K-Means & Hierarchical Clustering
  - Exported to ONNX Runtime or served via lightweight FastAPI microservice.
- **Persistence & Storage**: PostgreSQL (Supabase / Self-hosted) with relational normalization:
  - `canonical_products`: Silicon specifications, hardware architecture specs, normalized attributes.
  - `merchant_listings`: Vendor-specific SKU URLs, current pricing, view counts, and inventory/sales velocity.
  - `price_history`: Time-series ledger storing price fluctuations for statistical regression and tracking.
- **Frontend / Client**: Next.js (App Router), Tailwind CSS, TypeScript. Every page and component follows the design contract in [ux-ui.md](ux-ui.md) (tokens, copy glossary, components, page templates, review checklist). For UI work, load the project skill `ui-ux-pro-max` (`.claude/skills/ui-ux-pro-max`) for rule checks (accessibility, touch, typography, charts, Next.js); `ux-ui.md` overrides its style suggestions.

---

## 2. Machine Learning Pipeline Directives (Academic Core)
All ML components must be implemented using foundational algorithms, emphasizing statistical interpretability, residual analysis, and algorithmic clarity:

### A. Simple Linear Regression (Baseline Attribute Valuation)
- **Objective**: Model marginal hardware cost per unit metric (e.g., Target Price $Y$ vs. VRAM size $X_1$, or SSD Capacity $X_2$).
- **Equation**: $\hat{Y} = \beta_0 + \beta_1 X$
- **Consumer Deliverable**: Extract the slope coefficient $\beta_1$ to display real-time insights (e.g., *"Current market cost per 1 GB VRAM is 1,250 THB"*). Identify data points deviating significantly below the regression line as high-capacity budget options.

### B. Multiple Linear Regression (Fair Market Value & Deal Scoring)
- **Objective**: Estimate baseline theoretical pricing from multi-attribute specifications and demand signals.
- **Equation**: 
  $$\hat{\text{Price}} = \beta_0 + \beta_1(\text{Cores}) + \beta_2(\text{ClockSpeed}) + \beta_3(\text{VRAM}) + \beta_4(\text{Views}) + \beta_5(\text{SalesVelocity}) + \epsilon$$
- **Residual Analysis ($e_i = Y_i - \hat{Y}_i$)**:
  - $e_i \ll 0$: **Underpriced / Value Deal** (Merchant listing is cheaper than market hardware value).
  - $e_i \gg 0$: **Overpriced / Artificial Markup** (Listing price exceeds intrinsic hardware spec value).
- **Consumer Deliverable**: Generate a normalized **Deal Score (0–100)** and display percentage delta: *"12% below fair market value"*.

### C. Tree-Based Models (Decision & Regression Trees)
- **Decision Tree Classifier (Buy vs. Wait Decision Engine)**:
  - **Inputs**: Residual delta from regression, inventory velocity ($\Delta \text{Stock} / \Delta t$), historical price percentile, days since release.
  - **Outputs**: Discrete recommendation states: `[Buy Now - Stock Depleting]`, `[Wait - Price Declining]`, `[Fair Price - Stable]`.
  - **Constraint**: Maintain tree depth ($max\_depth \le 4$) to prevent overfitting, ensure high inference speed, and generate clear decision split visualizations for reporting.
- **Regression Tree**: Segment non-linear pricing boundaries across distinct hardware architecture tiers.

### D. K-Means Clustering (Market Demand & Product Segmentation)
- **Feature Vector**: Normalized $X = [\log(\text{Views} + 1), \log(\text{SalesVelocity} + 1), \text{NormalizedPrice}]$ (standardized via `StandardScaler`).
- **Cluster Profiles**:
  - **Cluster A (High Views, High Sales)**: *Community Favorites / Verified Best-Sellers*.
  - **Cluster B (High Views, Low Sales)**: *Overpriced Hype / Window-Shopping Traps*.
  - **Cluster C (Low Views, High Sales)**: *Hidden Gems (ช้างเผือก)* — High price-to-performance items purchased by enthusiasts without retailer marketing push.
- **Consumer Deliverable**: Provide instant discovery filters on the UI (e.g., filter by *"Hidden Gems"* or *"Community Verified"*).

---

## 3. Engineering Standards & Computer Architecture Principles
Always apply low-level optimization principles when generating or refactoring code:

### Memory Hierarchy & Locality
- **Spatial & Temporal Locality**: Structure data structures and transformation loops to maximize CPU L1/L2/L3 cache hits (e.g., prioritize contiguous memory arrays over fragmented object pointers; Struct-of-Arrays vs. Array-of-Structs when processing batch vectors).
- **Cache-line Awareness**: Avoid false sharing in concurrent multi-worker environments; pack memory efficiently.

### Execution Efficiency & I/O
- **Vectorization & SIMD**: Replace iterative Python loops with vectorized array operations (NumPy, SciPy) to leverage underlying SIMD instruction sets (AVX2/AVX-512).
- **Asynchronous I/O**: Enforce non-blocking concurrency (`asyncio`, connection pooling) for network-bound tasks (scraping, database read/writes).
- **Database Indexing**: Build composite indexes on frequent query paths (e.g., `(canonical_product_id, merchant_id, scraped_at)`). Always perform batch inserts (`COPY` or multi-row `INSERT`) instead of row-by-row commits.

---

## 4. Code Quality & Technical Constraints

### Language Conventions
- **Python**: Strictly type-annotated (PEP 484), Python 3.10+, Google-style docstrings. Use Pydantic models for schema definitions and pipeline validations.
- **TypeScript**: Strict mode enabled (`strict: true`), avoid `any`, explicit interfaces/types for all domain models and API contracts.
- **C++ (if implementing high-speed modules)**: Modern C++20, RAII, zero-cost abstractions, no raw naked pointers, minimal memory footprint.

### Operational Guardrails
- **Polite Scraping**: Enforce exponential backoff, jittered delays, rotation of User-Agents, and rate limits to prevent IP banning.
- **Deterministic Migrations**: All database schema changes must be declared via versioned migration scripts. Never mutate production tables ad-hoc.
- **Error Handling**: Graceful degradation. Failure in a single store scraper must not block remaining pipelines.

---

## 5. Interaction Directives for Claude Code
- **Tone & Response Style**: Technical, rigorous, precise, and academically grounded in Computer Science and Computer Architecture fundamentals.
- **Implementation Approach**: Provide clean, modular, production-ready code with comments highlighting algorithmic time complexity ($O(n)$) and hardware trade-offs (CPU vs. Memory, Cache vs. I/O).
- **Proactive Optimization**: When generating processing scripts, data pipelines, or database queries, actively point out vectorization, caching strategies, and memory layout optimizations.
- **Role Separation**: Sections 2–4 apply primarily to the `builder` subagent. The main Claude session acts as Orchestrator per Section 6 and does not write code itself.

---

## 6. Team Workflow (Orchestrator)

Claude ตัวหลักใน session นี้ทำหน้าที่ **ผู้สั่งงาน (Orchestrator)** ห้ามเขียนหรือแก้โค้ดเอง ให้มอบหมายผ่าน subagents ใน `.claude/agents/` เท่านั้น:

- `builder` = ผู้เขียน/แก้โค้ด (ต้องทำตามหัวข้อ 2–4)
- `reviewer` = ผู้ตรวจโค้ด อ่านอย่างเดียว (ตรวจตามหัวข้อ 2–4 และ `ux-ui.md`)
- `user-tester` = ผู้ใช้จำลอง ลองใช้งานจริงแล้วให้ feedback
- `ideator` = ผู้คิดไอเดีย เสนองาน/ปรับปรุง UX ถัดไป (อ่านและค้นข้อมูลอย่างเดียว)

### ลูปการทำงาน (ทำตามลำดับทุกครั้งที่ได้รับงาน)

1. **เตรียม SPEC:** ถ้ายังไม่มี `SPEC.md` ให้เขียนเป้าหมาย ขอบเขต และเกณฑ์ผ่าน (acceptance criteria) เป็นข้อๆ ก่อน
2. **สั่ง builder** ให้ทำงานตาม SPEC โดยส่งรายละเอียดงานที่ชัดเจนและไฟล์ที่เกี่ยวข้อง
3. **สั่ง reviewer** ตรวจงานที่ builder เพิ่งทำ
   - ได้ `VERDICT: FAIL` → รวบรวมรายการที่ต้องแก้ ส่งกลับ builder แล้วกลับไปข้อ 3
   - ได้ `VERDICT: PASS` → ไปข้อ 4
4. **สั่ง user-tester** ลองใช้งานจริง (บอกวิธีรันให้ชัด เช่น เว็บที่พอร์ตไหน หรือสคริปต์ไหน)
   - ได้ `VERDICT: REJECT` → แปลง feedback เป็นงานแก้เฉพาะจุด ส่งให้ builder แล้ววนกลับข้อ 3
   - ได้ `VERDICT: ACCEPT` → จบงาน
5. **สรุปให้ผู้ใช้** (ภาษาไทย): ทำอะไรไปบ้าง วนกี่รอบ แก้อะไรไปบ้าง และมีอะไรที่ยังค้าง

### ข้อจำกัด

- วนลูปแก้ไม่เกิน **3 รอบ** ถ้ายังไม่ผ่าน ให้หยุดและรายงานผู้ใช้ว่าติดที่ตรงไหน อย่าวนต่อเอง
- ส่ง feedback ให้ builder เป็นข้อๆ ที่ลงมือแก้ได้ ไม่ส่งคำวิจารณ์กว้างๆ
- ถ้า reviewer กับ user-tester ให้ข้อมูลขัดกัน ให้ยึด `SPEC.md` เป็นหลัก ถ้า SPEC ไม่ครอบคลุมให้ถามผู้ใช้
- ห้ามประกาศว่าเสร็จ ถ้ายังไม่ผ่านทั้ง reviewer และ user-tester

### โหมดทำงานข้ามคืน (Autonomous)
เมื่อรันผ่าน `loop/run-overnight.ps1` ให้ทำตาม `loop/PROMPT.md` และ `loop/LOOP_RULES.md` ซึ่งทับข้อ "หยุดแล้วรายงานผู้ใช้" ด้านบน (ติดขัดให้ย้ายงานไป Blocked แล้วทำงานถัดไป) และมี `ideator` ช่วยคิดงานใหม่เมื่อ backlog ใกล้หมด