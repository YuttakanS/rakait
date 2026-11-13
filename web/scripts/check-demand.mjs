/**
 * Checks of the demand-evidence copy logic (src/lib/demand.ts), runnable with
 * plain Node: `npm run check:demand`. The web app has no test runner, so
 * this transpiles the two pure modules with the TypeScript compiler already
 * in devDependencies (type stripping only, no type check: `tsc --noEmit`
 * does that), loads them as CommonJS from a temp folder and asserts on the
 * strings a shopper would read. No new dependency.
 *
 * Since SPEC round 17 the web no longer decides whether a model's numbers
 * support its group's name: the pipeline stores `labelFits` / `labelMiss`
 * (tests/test_ml.py covers the rule). These checks cover the wording built
 * from those flags and from the payload's thresholds.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const lib = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib");
const out = mkdtempSync(join(tmpdir(), "check-demand-"));
const sources = {};
for (const name of ["format", "demand"]) {
  sources[name] = readFileSync(join(lib, `${name}.ts`), "utf8");
  const { outputText } = ts.transpileModule(sources[name], {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  // .cjs so Node loads it as CommonJS whatever the nearest package.json says.
  writeFileSync(join(out, `${name}.cjs`), outputText.replaceAll('require("./format")', 'require("./format.cjs")'));
}
const require = createRequire(import.meta.url);
const d = require(join(out, "demand.cjs"));
const f = require(join(out, "format.cjs"));
rmSync(out, { recursive: true, force: true });

const plain = (s) => (s === null ? null : s.replaceAll("|", ""));
let checks = 0;
const eq = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what);
  checks += 1;
};

/** The live 2026.11-v14 numbers plus the v15 keys, through the real reader. */
const payload = {
  n: 308,
  split_views: 26911.339085,
  reference: { views_median: 19119.5, sales_beats_pct_median: 0 },
  label_rule: {
    sales_bar: 0.5,
    views_split: 26911.339085,
    views_median: 19119.5,
    window_days: 120,
    zero_share_means_no_sales: true,
  },
  unlabelled: { n: 9, by_label: { overpriced_hype: 7, hidden_gem: 1, community_favorite: 1 } },
  segments: [
    { label: "hidden_gem", views_median: 14220, sales_beats_pct: 0.81, sales_beats_pct_median: 0.8175 },
    { label: "overpriced_hype", views_median: 104248.5, sales_beats_pct: 0.22, sales_beats_pct_median: 0.1713 },
    { label: "niche", views_median: 9889, sales_beats_pct: 0.11, sales_beats_pct_median: 0 },
  ],
};
const ref = d.demandReference(payload);
/** A payload from before 2026.11-v15: no rule, no window, no counts. */
const v14 = { ...payload };
delete v14.label_rule;
delete v14.unlabelled;
const old = d.demandReference(v14);
const ev = (views, salesBeatsPct, extra = {}) => ({
  views,
  salesBeatsPct,
  normalizedPrice: 0.9,
  driver: null,
  labelFits: true,
  labelMiss: null,
  ...extra,
});

// ---- The reader.
eq(
  [ref.salesBar, ref.windowDays, ref.clustered, ref.unlabelled, ref.viewsMedian, ref.salesBeatsMedian, ref.zeroMeansNoSales],
  [0.5, 120, 308, 9, 19119.5, 0, true],
  "v15 payload",
);
eq([old.salesBar, old.windowDays, old.unlabelled, old.clustered], [null, null, null, 308], "v14 payload: no rule keys");
eq(d.demandReference(null), d.NO_REFERENCE, "no payload");

// ---- Card numbers: the sales window is always stated, แค่ under the bar.
eq(
  d.evidenceParts(ev(3120, 0.12), ref).map(plain),
  ["คนดู 3,120 ครั้ง", "ขายดีกว่าแค่ 12% ของสินค้าในร้าน (ติดตามไม่เกิน 120 วัน)"],
  "under the 50% bar: แค่",
);
eq(plain(d.salesText(ev(1, 0.494), ref)), "ขายดีกว่าแค่ 49% ของสินค้าในร้าน (ติดตามไม่เกิน 120 วัน)", "prints 49%: under the bar");
eq(plain(d.salesText(ev(1, 0.496), ref)), "ขายดีกว่า 50% ของสินค้าในร้าน (ติดตามไม่เกิน 120 วัน)", "prints 50%: at the bar, plain");
eq(plain(d.salesText(ev(1, 0.82), ref)), "ขายดีกว่า 82% ของสินค้าในร้าน (ติดตามไม่เกิน 120 วัน)", "above the bar: plain");
eq(plain(d.salesText(ev(1, 0.82), ref, true)), "ขายดีกว่า 82% ของสินค้าในร้านเดียวกัน ในช่วงที่ติดตาม (ไม่เกิน 120 วันล่าสุด)", "long form");
eq(plain(d.salesText(ev(1, 0), ref)), "ยังไม่เห็นยอดขาย (ติดตามไม่เกิน 120 วัน)", "raw 0: no sales seen in the window");
eq(plain(d.salesText(ev(1, 0.004), ref)), "ขายดีกว่าไม่ถึง 1% ของสินค้าในร้าน (ติดตามไม่เกิน 120 วัน)", "rounds to 0%");
eq(plain(d.salesText(ev(1, 0.12), old)), "ขายดีกว่า 12% ของสินค้าในร้าน", "v14 payload: no bar, no window");
eq(plain(d.salesText(ev(1, 0), old)), "ยังไม่ขายดีกว่าสินค้าใดในร้านช่วงนี้", "v14 payload: raw 0, nothing vouches for 'no sales'");
// A zero share is "no sales seen" only when the run says every store has unsold listings.
const sellsEverywhere = d.demandReference({ ...payload, label_rule: { ...payload.label_rule, zero_share_means_no_sales: false } });
eq(plain(d.salesText(ev(1, 0), sellsEverywhere)), "ยังไม่ขายดีกว่าสินค้าใดในร้าน (ติดตามไม่เกิน 120 วัน)", "raw 0, stores without unsold listings");
eq(plain(d.salesText(ev(1, 0), sellsEverywhere, true)), "ยังไม่ขายดีกว่าสินค้าใดในร้านในช่วงที่ติดตาม (ไม่เกิน 120 วัน)", "raw 0, long form");
eq(d.overallSalesText(sellsEverywhere), "เกินครึ่งของทุกรุ่นยังไม่ขายดีกว่าสินค้าใดในร้านช่วงนี้", "overall median 0, not vouched");
eq(plain(d.salesText(ev(1, 0), ref, true)), "ยังไม่เห็นยอดขายในช่วงที่ติดตาม (ไม่เกิน 120 วัน)", "raw 0, long form, vouched");
eq(d.windowText(ref, true).replaceAll("|", ""), " (ติดตามไม่เกิน 120 วัน)", "card form of the tracking cap");
assert.ok(!/(ช่วง|ใน) \$\{[^}]+\} วันล่าสุด/.test(sources.demand), "never 'in the last N days': the span is a cap");
checks += 1;
// The /insights tile goes through the same wording.
eq(d.shareTile(0.1713, ref), { value: "ขายดีกว่า ~17%", note: "ของสินค้าในร้านเดียวกัน ในช่วงที่ติดตาม (ไม่เกิน 120 วันล่าสุด)" }, "tile");
eq(d.shareTile(0, ref), { value: "ยังไม่เห็นยอดขาย", note: "ในช่วงที่ติดตาม (ไม่เกิน 120 วันล่าสุด)" }, "tile: zero in words");
eq(d.shareTile(0.004, old), { value: "ขายดีกว่าไม่ถึง 1%", note: "ของสินค้าในร้านเดียวกัน" }, "tile: tiny, old payload");
// Group figures prefer the labelled models' own statistics (v15+).
eq(
  d.demandReference({ segments: [{ label: "overpriced_hype", views_median: 104248.5, sales_beats_pct_median: 0.1713, labelled_views_median: 99000, labelled_sales_beats_pct_median: 0.12 }] }).groups.overpriced_hype,
  { viewsMedian: 99000, salesBeats: 0.12, salesBeatsIsMedian: true },
  "labelled statistics win",
);
eq(d.salesShare(0), { kind: "zero", pct: 0 }, "salesShare zero");
eq(d.salesShare(0.004), { kind: "tiny", pct: 0 }, "salesShare tiny");
eq(d.windowText(ref), " ในช่วงที่ติดตาม (ไม่เกิน 120 วันล่าสุด)", "window text");
eq(d.windowText(old), "", "no window stored");

// ---- Missing data is named, never printed as 0.
eq(d.evidenceParts(ev(null, null), ref).map(plain), ["ยังไม่มีตัวเลขยอดเข้าชมและยอดขายของรุ่นนี้"], "no numbers yet");
eq(d.evidenceParts(ev(1200, null), ref).map(plain), ["คนดู 1,200 ครั้ง", "ไม่มีข้อมูลยอดขาย"], "sales missing");
eq(
  d.evidenceParts(ev(null, 0.5), ref).map(plain),
  ["ไม่มีข้อมูลยอดเข้าชม", "ขายดีกว่า 50% ของสินค้าในร้าน (ติดตามไม่เกิน 120 วัน)"],
  "views missing",
);

// ---- A card never says the numbers contradict a group, whatever the flags.
const cardText = (e, cluster, r) => [...d.evidenceParts(e, r), d.withheldLine(cluster, e, r)].join(" ");
for (const cluster of Object.keys(f.CLUSTER_LABELS)) {
  for (const labelFits of [true, false, null]) {
    for (const labelMiss of [null, "views", "sales", "both"]) {
      for (const [views, sales] of [[120, 0.6], [900000, 0], [null, null], [26911, 0.5]]) {
        for (const r of [ref, old, d.NO_REFERENCE]) {
          const text = cardText(ev(views, sales, { labelFits, labelMiss, driver: "price" }), cluster, r);
          assert.ok(!/ไม่ตรง|โดยรวม|คล้ายกลุ่ม|มิติ|ชี้ขาด|ใกล้กลุ่ม|undefined|null|NaN/.test(text), `card text: ${text}`);
        }
      }
    }
  }
}
checks += 1;
for (const gone of ["nameMismatch", "cardConflict", "evidenceSides", "compareSide", "driverIsMismatched"]) {
  assert.equal(d[gone], undefined, `${gone} must not exist: the rule lives in the pipeline`);
}
assert.ok(!/ไม่ตรงชื่อกลุ่ม · |แต่โดยรวมยังคล้ายกลุ่มนี้ที่สุด/.test(sources.demand), "card contradiction copy is gone");
checks += 2;

// ---- Badge withheld by a deal-conflict rule: one line, with the window.
eq(
  plain(d.withheldLine("overpriced_hype", ev(31200, 0.12), ref)),
  "กลุ่ม: คนดูเยอะ แต่ขายน้อย (คนดู 31,200 ครั้ง · ขายดีกว่าแค่ 12% (ติดตามไม่เกิน 120 วัน))",
  "withheld badge: one line",
);
eq(
  plain(d.withheldLine("hidden_gem", ev(900, 0.8), ref)),
  "กลุ่ม: ขายดี แต่คนดูน้อย (คนดู 900 ครั้ง · ขายดีกว่า 80% (ติดตามไม่เกิน 120 วัน))",
  "withheld badge: above the bar",
);
eq(
  plain(d.withheldLine("overpriced_hype", ev(31200, 0), ref)),
  "กลุ่ม: คนดูเยอะ แต่ขายน้อย (คนดู 31,200 ครั้ง · ยังไม่เห็นยอดขาย (ติดตามไม่เกิน 120 วัน))",
  "withheld: raw zero",
);
eq(
  plain(d.withheldLine("overpriced_hype", ev(null, 0.004), old)),
  "กลุ่ม: คนดูเยอะ แต่ขายน้อย (ไม่มีข้อมูลยอดเข้าชม · ขายดีกว่าไม่ถึง 1%)",
  "withheld: views missing, tiny share, old payload",
);
eq(plain(d.withheldLine("overpriced_hype", ev(null, null), ref)), "กลุ่ม: คนดูเยอะ แต่ขายน้อย (ยังไม่มีตัวเลข)", "withheld: no numbers");

// ---- The neutral remainder group: new name, break marks, no claim.
eq(f.CLUSTER_LABELS.niche.label, "ไม่เด่นทั้งคนดูและยอดขาย", "neutral name");
eq(plain(f.CLUSTER_LABELS.niche.wrap), f.CLUSTER_LABELS.niche.label, "wrap marks spell the label");
assert.ok(!/คนดูน้อย|ขายน้อย/.test(f.CLUSTER_LABELS.niche.label + f.CLUSTER_LABELS.niche.hint), "claims neither few views nor few sales");
checks += 1;
eq(d.labelRuleText("niche", ref), null, "the neutral group promises no number");

// ---- What each badge promises, with the payload's thresholds (described, not evaluated).
eq(
  d.labelRuleText("overpriced_hype", ref),
  "คนดูมากกว่าค่ากลางของทุกรุ่น (19,120 ครั้ง) และขายดีกว่าไม่ถึง 50% ของสินค้าในร้านเดียวกัน ในช่วงที่ติดตาม (ไม่เกิน 120 วันล่าสุด)",
  "hype rule",
);
eq(
  d.labelRuleText("hidden_gem", ref),
  "ขายดีกว่าอย่างน้อย 50% ของสินค้าในร้านเดียวกัน ในช่วงที่ติดตาม (ไม่เกิน 120 วันล่าสุด) และคนดูไม่เกินเส้นแบ่งของรุ่นขายดี (26,911 ครั้ง)",
  "hidden gem rule",
);
eq(
  d.labelRuleText("community_favorite", ref),
  "ขายดีกว่าอย่างน้อย 50% ของสินค้าในร้านเดียวกัน ในช่วงที่ติดตาม (ไม่เกิน 120 วันล่าสุด) และคนดูมากกว่าเส้นแบ่งของรุ่นขายดี (26,911 ครั้ง)",
  "favourite rule",
);
eq(d.labelRuleText("overpriced_hype", old), null, "v14 payload: no rule to quote");

// ---- Product page, labelled model.
eq(
  d.demandWhy("overpriced_hype", ev(104248, 0.17), ref).why,
  `ตัวเลขของรุ่นนี้ตรงกับเกณฑ์ของป้าย: ${d.labelRuleText("overpriced_hype", ref)}`,
  "page: fits",
);
assert.ok(d.demandWhy("niche", ev(9889, 0), ref).why.startsWith("กลุ่มนี้คือรุ่นที่เหลือจากกลุ่มอื่น"), "page: neutral group");
checks += 1;
eq(d.demandWhy("overpriced_hype", ev(104248, 0.17, { labelFits: null }), old).why, null, "page: unknown flag claims nothing");
eq(d.demandWhy("overpriced_hype", ev(104248, 0.17, { labelFits: false }), ref).why, null, "page: unfit is not 'why this group'");

// ---- Product page, model K-Means grouped but the site does not badge.
const unfit = (driver, labelMiss, normalizedPrice = 0.82) => ev(732006, 0.679, { labelFits: false, labelMiss, driver, normalizedPrice });
eq(
  d.unlabelledWhy("overpriced_hype", unfit("views", "sales"), ref),
  {
    assigned: "K-Means จัดรุ่นนี้ไว้ในกลุ่ม “คนดูเยอะ แต่ขายน้อย” แต่เว็บไม่ติดป้ายกลุ่มให้ เพราะยอดขายของรุ่นนี้ไม่ตรงกับชื่อกลุ่ม",
    rule: `ป้ายนี้ใช้กับรุ่นที่${d.labelRuleText("overpriced_hype", ref)}`,
    reason: "K-Means จัดรุ่นนี้ไว้กลุ่มนี้เพราะยอดเข้าชมเป็นหลัก",
    method: `กลุ่มจัดด้วย K-Means จาก ${d.DIMENSION_COUNT} อย่างพร้อมกัน (${d.DIMENSIONS_TEXT}) ไม่ได้ตัดที่เกณฑ์ทีละตัว รุ่นหนึ่งจึงถูกจัดเข้ากลุ่มได้แม้ตัวเลขบางตัวไม่ตรงชื่อกลุ่ม เว็บติดป้ายเฉพาะรุ่นที่ตัวเลขตรงชื่อ`,
  },
  "unlabelled: another feature decided",
);
eq(
  d.unlabelledWhy("overpriced_hype", unfit("price", "sales"), ref).reason,
  "K-Means จัดรุ่นนี้ไว้กลุ่มนี้เพราะราคาเป็นหลัก: ราคาต่ำสุดที่มีของตอนนี้ถูกกว่าราคากลางของรุ่นนี้ 18%",
  "unlabelled: price decided, gap as a percent",
);
eq(
  d.unlabelledWhy("overpriced_hype", unfit("price", "sales", 1.07), ref, false).reason,
  "K-Means จัดรุ่นนี้ไว้กลุ่มนี้เพราะราคาเป็นหลัก: ราคาล่าสุดที่ต่ำที่สุด (ตอนนี้หมดทุกร้าน) แพงกว่าราคากลางของรุ่นนี้ 7%",
  "unlabelled: price decided, sold out everywhere",
);
eq(
  d.unlabelledWhy("overpriced_hype", unfit("price", "sales", 1.004), ref).reason,
  "K-Means จัดรุ่นนี้ไว้กลุ่มนี้เพราะราคาเป็นหลัก",
  "unlabelled: price gap under 1% is not quoted",
);
const whole = "เมื่อดูยอดเข้าชม ยอดขาย และราคารวมกัน รุ่นนี้ยังคล้ายกลุ่มนี้มากกว่ากลุ่มอื่น K-Means จึงจัดไว้กลุ่มนี้";
eq(d.unlabelledWhy("overpriced_hype", unfit("sales", "sales"), ref).reason, whole, "unlabelled: the failing number cannot be 'the reason'");
eq(d.unlabelledWhy("overpriced_hype", unfit("views", "both"), ref).reason, whole, "unlabelled: both fail");
eq(d.unlabelledWhy("overpriced_hype", unfit(null, "sales"), ref).reason, whole, "unlabelled: no driver stored");
assert.ok(d.unlabelledWhy("hidden_gem", unfit("views", "both"), ref).assigned.includes("เพราะยอดเข้าชมและยอดขายของรุ่นนี้"), "subject: both");
assert.ok(d.unlabelledWhy("hidden_gem", unfit("price", "views"), ref).assigned.includes("เพราะยอดเข้าชมของรุ่นนี้"), "subject: views");
checks += 2;
eq(d.unlabelledWhy("overpriced_hype", unfit("price", "sales"), old).rule, null, "unlabelled: no thresholds to quote");
eq(d.priceGapText(1.004, true), null, "price gap under 1%: nothing to quote");
eq(d.DIMENSION_COUNT, 3, "three clustered features today");

// ---- Group line: both halves in one shape; a zero median is said in words.
eq(
  d.groupComparison("overpriced_hype", ref),
  "รุ่นในกลุ่มนี้: ค่ากลางคนดู 104,249 ครั้ง (ทุกรุ่น 19,120 ครั้ง) · ค่ากลางยอดขาย: ขายดีกว่า ~17% ของสินค้าในร้าน ในช่วงที่ติดตาม (ไม่เกิน 120 วันล่าสุด) (เกินครึ่งของทุกรุ่นยังไม่เห็นยอดขายช่วงนี้)",
  "group comparison, all-model median 0",
);
eq(
  d.groupComparison("niche", ref),
  "รุ่นในกลุ่มนี้: ค่ากลางคนดู 9,889 ครั้ง (ทุกรุ่น 19,120 ครั้ง) · ค่ากลางยอดขาย: เกินครึ่งของรุ่นในกลุ่มนี้ยังไม่เห็นยอดขายในช่วงที่ติดตาม (ไม่เกิน 120 วัน) (เกินครึ่งของทุกรุ่นยังไม่เห็นยอดขายช่วงนี้)",
  "group comparison, group median 0",
);
eq(
  d.groupNumbers("hidden_gem", ref),
  "ค่ากลางคนดู 14,220 ครั้ง · ค่ากลางยอดขาย: ขายดีกว่า ~82% ของสินค้าในร้าน ในช่วงที่ติดตาม (ไม่เกิน 120 วันล่าสุด)",
  "group numbers",
);
eq(d.overallSalesText(ref), "เกินครึ่งของทุกรุ่นยังไม่เห็นยอดขายช่วงนี้", "overall median 0 in words");
eq(
  d.overallSalesText(d.demandReference({ ...payload, reference: { views_median: 5300, sales_beats_pct_median: 0.35 } })),
  "ทุกรุ่น ~35%",
  "overall median above 0",
);
eq(d.overallSalesText(d.NO_REFERENCE), null, "no overall median");
for (const cluster of Object.keys(f.CLUSTER_LABELS)) {
  for (const r of [ref, old]) {
    const line = `${d.groupComparison(cluster, r)} ${d.groupNumbers(cluster, r)}`;
    assert.ok(!/~0%/.test(line), `never "~0%": ${line}`);
  }
}
checks += 1;
eq(
  d.groupComparison(
    "niche",
    d.demandReference({ segments: [{ label: "niche", views_median: 9889, sales_beats_pct: 0.11 }], split_views: 50 }),
  ),
  "รุ่นในกลุ่มนี้: ค่ากลางคนดู 9,889 ครั้ง · ค่าเฉลี่ยยอดขาย: ขายดีกว่า ~11% ของสินค้าในร้าน",
  "group comparison (v13 payload: mean, no overall part, no window)",
);

// ---- Unlabelled count, from the payload.
eq(
  d.unlabelledText(ref),
  "มี 9 รุ่นจาก 308 รุ่นที่ K-Means จัดกลุ่มแล้วแต่ไม่ติดป้าย เพราะยอดเข้าชมหรือยอดขายของรุ่นนั้นไม่ตรงกับชื่อกลุ่ม (K-Means ดูราคาด้วย) รุ่นเหล่านี้แสดงแค่ตัวเลข และไม่อยู่ในรายการของกลุ่ม",
  "unlabelled count",
);
eq(d.unlabelledText(old), null, "v14 payload: no count");
eq(d.unlabelledText(d.demandReference({ ...payload, unlabelled: { n: 0, by_label: {} } })), null, "none unlabelled");

console.log(`check-demand: ${checks} checks passed`);
