/**
 * The formula boxes of /ml and how they wrap (SPEC round 18).
 *
 * A formula mixes Thai words and math. Thai has no spaces inside a word, and
 * the browser's dictionary split "ต่ำสุด" into "ต่ำ|สุด"; a plain space break
 * also cut "Σ‖x − μ_กลุ่ม‖²" in two. So a formula is cut into units at its
 * spaces, every unit is rendered `nowrap`, and lines break only between
 * units:
 *
 * - a Thai word (Thai letters with brackets or punctuation around them) is
 *   one unit;
 * - consecutive math tokens form one unit when they are at most
 *   `MAX_MATH_RUN` characters (about 220 px of 14 px mono text, inside the
 *   box at 320 px); a longer run is cut only before an operator outside any
 *   bracket, the way printed math breaks, or after a list item ending "),";
 * - a "·" separator outside brackets stays at the end of the unit before it.
 *
 * Units joined by single spaces give back the input exactly: no character
 * is ever dropped (`npm run check:demand` asserts it for every formula
 * here). Pure, O(length).
 */

/** Every plain-text formula box on /ml, so the wrapping can be checked against the source. */
export const FORMULAS = {
  slr: "ŷ = β₀ + β₁x · β₁ = cov(x, y) / var(x) · β₀ = ȳ − β₁x̄",
  mlr: "log(ราคา) = β₀ + β₁x₁ + β₂x₂ + … + βₚxₚ + ε",
  dealScore: "residual e = log(ราคาจริง) − log(ราคายุติธรรม) · Deal Score = 100 × (1 − Φ(e / (s√(1 + h))))",
  tierTree: "เลือกการแบ่ง (ฟีเจอร์ j, ค่า t) ที่ทำให้ Σ(y − ȳ_ซ้าย)² + Σ(y − ȳ_ขวา)² ต่ำสุด · y = log(ราคา)",
  kmeansRanked:
    "X = [log(ยอดเข้าชม + 1), อันดับยอดขายในร้าน (0–1), ราคาเทียบราคาปกติของรุ่น] · ปรับทุกแกนให้ค่าเฉลี่ย 0 SD 1 (StandardScaler) · ต่ำสุด Σ‖x − μ_กลุ่ม‖²",
  kmeansRates:
    "X = [log(ยอดเข้าชม + 1), log(ยอดขายต่อวัน + 1), ราคาเทียบราคาปกติของรุ่น] · ปรับทุกแกนให้ค่าเฉลี่ย 0 SD 1 (StandardScaler) · ต่ำสุด Σ‖x − μ_กลุ่ม‖²",
  ward: "ต้นทุนการรวม A กับ B = (|A||B| / (|A| + |B|)) · ‖μ_A − μ_B‖²",
  gini: "Gini = 1 − Σ pₖ² · pₖ = สัดส่วนของคลาส k ใน node (0 = มีคลาสเดียวล้วน)",
  cosine: "cosine(a, b) = (a · b) / (‖a‖ ‖b‖) · 1 = ชื่อเหมือนกันทุกคำ, 0 = ไม่มีคำร่วม",
} as const;

/** Longest math run kept on one line, in characters. */
export const MAX_MATH_RUN = 26;

/** Thai letters, optionally inside brackets or followed by punctuation: one word. */
const THAI_WORD = /^[([]*[฀-๿]+[)\],:]*$/;
/** Tokens a long math run may break before (outside brackets). */
const OPERATORS = new Set(["=", "+", "−", "-", "×", "/", "≤", "·"]);

/** Bracket depth change across a token. */
function depthChange(token: string): number {
  let d = 0;
  for (const ch of token) {
    if (ch === "(" || ch === "[") d += 1;
    else if (ch === ")" || ch === "]") d -= 1;
  }
  return d;
}

/**
 * A formula cut into units that each stay on one line; `units.join(" ")`
 * equals `text`. See the module comment for the rules.
 */
export function formulaUnits(text: string): string[] {
  const units: string[][] = [];
  let run: { token: string; depth: number }[] = [];
  const flush = () => {
    if (run.length === 0) return;
    if (run.map((r) => r.token).join(" ").length <= MAX_MATH_RUN) {
      units.push(run.map((r) => r.token));
    } else {
      let group: string[] = [];
      for (const r of run) {
        const afterComma = group.length > 0 && group[group.length - 1].endsWith("),");
        if (group.length > 0 && ((r.depth === 0 && OPERATORS.has(r.token)) || afterComma)) {
          units.push(group);
          group = [];
        }
        group.push(r.token);
      }
      units.push(group);
    }
    run = [];
  };
  let depth = 0;
  for (const token of text.split(" ")) {
    if (token === "·" && depth === 0) {
      flush();
      if (units.length > 0) units[units.length - 1].push(token);
      else units.push([token]);
    } else if (THAI_WORD.test(token)) {
      flush();
      units.push([token]);
    } else {
      run.push({ token, depth });
    }
    depth = Math.max(0, depth + depthChange(token));
  }
  flush();
  return units.map((u) => u.join(" "));
}
