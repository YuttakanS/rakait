/**
 * Checks of the demand-evidence copy logic (src/lib/demand.ts) and of the
 * /ml tree helpers (src/lib/ml.ts), runnable with plain Node:
 * `npm run check:demand`. The web app has no test runner, so
 * this transpiles the pure modules with the TypeScript compiler already
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
for (const name of ["format", "demand", "ml", "formula"]) {
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
const ml = require(join(out, "ml.cjs"));
const fx = require(join(out, "formula.cjs"));
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
/** 2026.11-v16: the remainder group is badged only under the sales bar (SPEC round 18). */
const v16 = d.demandReference({ ...payload, label_rule: { ...payload.label_rule, niche_below_bar: true } });
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
eq([old.nicheBelowBar, ref.nicheBelowBar, v16.nicheBelowBar], [false, false, true], "niche rule flag: v16 only");
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
// A card without a badge (labelFits false) words its share like any other (SPEC round 18).
eq(
  d.evidenceParts(ev(3120, 0.44, { labelFits: false, labelMiss: "sales" }), ref).map(plain),
  ["คนดู 3,120 ครั้ง", "ขายดีกว่าแค่ 44% ของสินค้าในร้าน (ติดตามไม่เกิน 120 วัน)"],
  "unlabelled card under the bar: แค่",
);
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
// The /insights tile goes through the same wording, titled by the statistic it shows.
eq(
  d.shareTile(0.1713, ref, true),
  { title: "ยอดขายโดยทั่วไป", value: "ขายดีกว่า ~17%", note: "ของสินค้าในร้านเดียวกัน ในช่วงที่ติดตาม (ไม่เกิน 120 วันล่าสุด)" },
  "tile: median",
);
eq(
  d.shareTile(0, ref, true),
  { title: "ยอดขายโดยทั่วไป", value: "ยังไม่เห็นยอดขาย", note: "เกินครึ่งของรุ่นในกลุ่มนี้ ในช่วงที่ติดตาม (ไม่เกิน 120 วันล่าสุด)" },
  "tile: median 0 in words",
);
eq(d.shareTile(0, ref), { title: "ยอดขายเฉลี่ย", value: "ยังไม่เห็นยอดขาย", note: "ในช่วงที่ติดตาม (ไม่เกิน 120 วันล่าสุด)" }, "tile: mean 0");
eq(d.shareTile(0.004, old), { title: "ยอดขายเฉลี่ย", value: "ขายดีกว่าไม่ถึง 1%", note: "ของสินค้าในร้านเดียวกัน" }, "tile: tiny mean, old payload");
// The tile reads the statistic the list line quotes: the group's median when stored.
eq([ref.groups.overpriced_hype.salesBeats, ref.groups.overpriced_hype.salesBeatsIsMedian], [0.1713, true], "tile statistic = list statistic");
// Group figures prefer the labelled models' own statistics (v15+).
eq(
  d.demandReference({ segments: [{ label: "overpriced_hype", views_median: 104248.5, sales_beats_pct_median: 0.1713, labelled_views_median: 99000, labelled_sales_beats_pct_median: 0.12 }] }).groups.overpriced_hype,
  { viewsMedian: 99000, salesBeats: 0.12, salesBeatsIsMedian: true, labelled: null, size: null },
  "labelled statistics win",
);
// ---- A group with no model to list (SPEC round 18): chips, (i) and the empty list say why.
eq(d.emptyGroupReason("community_favorite", ref), "รอบนี้ไม่มีรุ่นในกลุ่มนี้ เพราะ K-Means ไม่ได้จัดกลุ่มใดให้ได้ชื่อนี้", "no segment");
eq(
  d.emptyGroupCause("overpriced_hype", d.demandReference({ segments: [{ label: "overpriced_hype", size: 7, labelled: 0 }] })),
  "K-Means จัดไว้ 7 รุ่น แต่ตัวเลขของทุกรุ่นไม่ตรงชื่อกลุ่ม",
  "segment whose models all fail the rule",
);
eq(d.emptyGroupReason("overpriced_hype", d.demandReference({ segments: [{ label: "overpriced_hype", size: 7, labelled: 3 }] })), null, "group with models");
eq(d.emptyGroupReason("overpriced_hype", d.NO_REFERENCE), null, "no payload: cannot tell");
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

// ---- The remainder group (SPEC round 18, option D): a sales-only name, break marks, no views claim.
eq(f.CLUSTER_LABELS.niche.label, "ยอดขายไม่เด่น", "remainder group name");
eq(plain(f.CLUSTER_LABELS.niche.wrap), f.CLUSTER_LABELS.niche.label, "wrap marks spell the label");
assert.ok(!/คนดู/.test(f.CLUSTER_LABELS.niche.label), "the name claims nothing about views");
assert.ok(/K-Means/.test(f.CLUSTER_LABELS.niche.hint) && /ไม่ได้บอกอะไรเรื่องยอดเข้าชม/.test(f.CLUSTER_LABELS.niche.hint), "hint: K-Means' remainder, no views claim");
assert.ok(!/ไม่เด่นทั้งคนดูและยอดขาย/.test(sources.demand), "old name gone from the copy");
checks += 3;
eq(d.labelRuleText("niche", ref), null, "v15: the neutral group stated no rule (and kept every badge)");
eq(
  d.labelRuleText("niche", v16),
  "ขายดีกว่าไม่ถึง 50% ของสินค้าในร้านเดียวกัน ในช่วงที่ติดตาม (ไม่เกิน 120 วันล่าสุด)",
  "v16: the neutral group is badged only under the bar",
);
eq(d.nicheRuleText(ref), "กลุ่มที่เหลือจาก K-Means ป้ายนี้ไม่ได้บอกอะไรเรื่องยอดเข้าชม", "(i) and /ml, v15");
eq(
  d.nicheRuleText(v16),
  "กลุ่มที่เหลือจาก K-Means ติดป้ายเฉพาะรุ่นที่ขายดีกว่าไม่ถึง 50% ของสินค้าในร้านเดียวกัน ในช่วงที่ติดตาม (ไม่เกิน 120 วันล่าสุด) ป้ายนี้ไม่ได้บอกอะไรเรื่องยอดเข้าชม",
  "(i) and /ml, v16",
);
// Short rules for the product page: no window, no bracket, so a bracket around them never nests.
eq(
  ["hidden_gem", "community_favorite", "overpriced_hype", "niche"].map((c) => d.labelRuleShort(c, v16)),
  [
    "ขายดีกว่าอย่างน้อย 50% และคนดูไม่เกิน 26,911 ครั้ง",
    "ขายดีกว่าอย่างน้อย 50% และคนดูมากกว่า 26,911 ครั้ง",
    "คนดูมากกว่า 19,120 ครั้ง และขายดีกว่าไม่ถึง 50%",
    "ขายดีกว่าไม่ถึง 50%",
  ],
  "short rules",
);
eq([d.labelRuleShort("niche", ref), d.labelRuleShort("hidden_gem", old)], [null, null], "short rules: v15 remainder, v14 payload");
assert.ok(!/ไม่ได้อ้างตัวเลข/.test(sources.demand), "the remainder group's name does claim something: no 'claims no number'");
checks += 1;

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
  "ตัวเลขของรุ่นนี้ตรงเกณฑ์ของป้าย (คนดูมากกว่า 19,120 ครั้ง และขายดีกว่าไม่ถึง 50%)",
  "page: fits",
);
eq(
  d.demandWhy("niche", ev(9889, 0), ref).why,
  "กลุ่มที่เหลือจาก K-Means ป้ายนี้ไม่ได้บอกอะไรเรื่องยอดเข้าชม",
  "page: remainder group, v15",
);
eq(
  d.demandWhy("niche", ev(9889, 0.2), v16).why,
  "กลุ่มที่เหลือจาก K-Means และตัวเลขของรุ่นนี้ตรงเกณฑ์ของป้าย (ขายดีกว่าไม่ถึง 50%) ป้ายนี้ไม่ได้บอกอะไรเรื่องยอดเข้าชม",
  "page: remainder group, v16",
);
// Printed after "ที่ได้กลุ่มนี้:": never a colon of its own, never nested brackets.
for (const c of Object.keys(f.CLUSTER_LABELS)) {
  for (const r of [ref, v16, old]) {
    const why = d.demandWhy(c, ev(9889, 0.2), r).why ?? "";
    assert.ok(!why.includes(":") && !/\([^)]*\(/.test(why), `why: ${why}`);
  }
}
checks += 1;
// A remainder-group model at or above the bar is unlabelled and explained like the others.
const nicheUnfit = d.unlabelledWhy(
  "niche",
  ev(2988, 0.94, { labelFits: false, labelMiss: "sales", driver: "price", normalizedPrice: 1.3 }),
  v16,
);
eq(
  [nicheUnfit.assigned, nicheUnfit.rule, nicheUnfit.reason],
  [
    "K-Means จัดรุ่นนี้ไว้กลุ่ม “ยอดขายไม่เด่น” แต่ไม่ติดป้าย เพราะยอดขายไม่ตรงเกณฑ์ของป้าย",
    "ป้ายนี้ใช้กับรุ่นที่ขายดีกว่าไม่ถึง 50%",
    "K-Means จัดรุ่นนี้ไว้กลุ่มนี้เพราะราคาเป็นหลัก: ราคาต่ำสุดที่มีของตอนนี้แพงกว่าราคากลางของรุ่นนี้ 30%",
  ],
  "page: unlabelled remainder-group model",
);
eq(d.demandWhy("overpriced_hype", ev(104248, 0.17, { labelFits: null }), old).why, null, "page: unknown flag claims nothing");
eq(d.demandWhy("overpriced_hype", ev(104248, 0.17, { labelFits: false }), ref).why, null, "page: unfit is not 'why this group'");

// ---- Product page, model K-Means grouped but the site does not badge.
const unfit = (driver, labelMiss, normalizedPrice = 0.82) => ev(732006, 0.679, { labelFits: false, labelMiss, driver, normalizedPrice });
eq(
  d.unlabelledWhy("overpriced_hype", unfit("views", "sales"), ref),
  {
    assigned: "K-Means จัดรุ่นนี้ไว้กลุ่ม “คนดูเยอะ แต่ขายน้อย” แต่ไม่ติดป้าย เพราะยอดขายไม่ตรงเกณฑ์ของป้าย",
    rule: "ป้ายนี้ใช้กับรุ่นที่คนดูมากกว่า 19,120 ครั้ง และขายดีกว่าไม่ถึง 50%",
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
assert.ok(d.unlabelledWhy("hidden_gem", unfit("views", "both"), ref).assigned.includes("เพราะยอดเข้าชมและยอดขายไม่ตรงเกณฑ์"), "subject: both");
// The page prints "assigned (rule)": no bracket inside the rule, so never "))" (SPEC round 18).
for (const c of Object.keys(f.CLUSTER_LABELS)) {
  const w = d.unlabelledWhy(c, unfit("price", "sales"), v16);
  assert.ok(!/[()]/.test(`${w.assigned}${w.rule ?? ""}`), `unlabelled paragraph: ${w.assigned} (${w.rule})`);
}
assert.ok(d.unlabelledWhy("hidden_gem", unfit("price", "views"), ref).assigned.includes("เพราะยอดเข้าชมไม่ตรงเกณฑ์"), "subject: views");
checks += 2;
eq(d.unlabelledWhy("overpriced_hype", unfit("price", "sales"), old).rule, null, "unlabelled: no thresholds to quote");
eq(d.priceGapText(1.004, true), null, "price gap under 1%: nothing to quote");
eq(d.DIMENSION_COUNT, 3, "three clustered features today");

// ---- Group line: one bracket per half, the tracking cap once; a zero median is said in words.
eq(
  d.groupComparison("overpriced_hype", ref),
  "รุ่นในกลุ่มนี้: ค่ากลางคนดู 104,249 ครั้ง (ทุกรุ่น 19,120 ครั้ง) · ค่ากลางยอดขาย: ขายดีกว่า ~17% ของสินค้าในร้าน (ทุกรุ่น: เกินครึ่งยังไม่เห็นยอดขาย) · ติดตามไม่เกิน 120 วัน",
  "group comparison, all-model median 0",
);
eq(
  d.groupComparison("niche", ref),
  "รุ่นในกลุ่มนี้: ค่ากลางคนดู 9,889 ครั้ง (ทุกรุ่น 19,120 ครั้ง) · ยอดขาย: เกินครึ่งของรุ่นในกลุ่มนี้และของทุกรุ่นยังไม่เห็นยอดขาย · ติดตามไม่เกิน 120 วัน",
  "group comparison, group and all-model medians both 0: one sentence",
);
const r35 = d.demandReference({ ...payload, reference: { views_median: 5300, sales_beats_pct_median: 0.35 } });
eq(
  d.groupComparison("niche", r35),
  "รุ่นในกลุ่มนี้: ค่ากลางคนดู 9,889 ครั้ง (ทุกรุ่น 5,300 ครั้ง) · ค่ากลางยอดขาย: เกินครึ่งของรุ่นในกลุ่มนี้ยังไม่เห็นยอดขาย (ทุกรุ่น ~35%) · ติดตามไม่เกิน 120 วัน",
  "group comparison, group median 0, all-model above 0",
);
eq(
  d.groupComparison("hidden_gem", d.demandReference({ ...payload, reference: { views_median: 5300, sales_beats_pct_median: 0.8175 } })),
  "รุ่นในกลุ่มนี้: ค่ากลางคนดู 14,220 ครั้ง (ทุกรุ่น 5,300 ครั้ง) · ค่ากลางยอดขาย: ขายดีกว่า ~82% ของสินค้าในร้าน เท่ากับทุกรุ่น · ติดตามไม่เกิน 120 วัน",
  "group comparison, same share as all models: no bracket",
);
eq(
  d.groupComparison("niche", old),
  "รุ่นในกลุ่มนี้: ค่ากลางคนดู 9,889 ครั้ง (ทุกรุ่น 19,120 ครั้ง) · ยอดขาย: เกินครึ่งของรุ่นในกลุ่มนี้และของทุกรุ่นยังไม่ขายดีกว่าสินค้าใดในร้านช่วงนี้",
  "group comparison, v14 payload: no cap, the zero sentence says 'ช่วงนี้'",
);
for (const cluster of Object.keys(f.CLUSTER_LABELS)) {
  for (const r of [ref, old, v16, r35]) {
    const line = d.groupComparison(cluster, r) ?? "";
    assert.ok(!/\)\s*\(/.test(line), `never two brackets in a row: ${line}`);
    assert.ok(!line.includes("|"), `no break marks in plain text: ${line}`);
  }
}
checks += 1;
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

// ---- /ml trees (lib/ml.ts): "ใช่" first for every question, and the balanced-weight leaf.
const node = (id, feature, left, right, value = 1) => ({ id, feature, threshold: feature ? 0.5 : null, left, right, n: 1, value, impurity: 0 });
eq(ml.yesNoChildren(node(0, "price_percentile_own", 1, 2)), [1, 2], "≤ question: yes = sklearn left");
eq(ml.yesNoChildren(node(0, "is_amd", 1, 2)), [2, 1], "yes/no spec: yes = sklearn right");
eq(ml.yesNoChildren(node(3, null, null, null)), null, "leaf");
const flagTree = [node(0, "is_amd", 1, 2), node(1, null, null, null, 100), node(2, null, null, null, 200)];
eq(
  ml.treeOutline(flagTree, (n) => String(n.value)).split("\n").map((l) => l.trim()),
  ["เป็น AMD? (n = 1)", "ใช่: 200 (n = 1)", "ไม่ใช่: 100 (n = 1)"],
  "outline: ใช่ first",
);
eq(ml.pathTo(flagTree, 2), ["“เป็น AMD” ใช่"], "path to the yes side of a flag");
// The live 2026.11-v15 timing tree's root and its "ซื้อเลย n = 13, 8%" leaf.
const cls = (counts, winner) => ({ counts, winner });
const timing = [
  { ...node(0, "price_percentile_own", 1, 2), value: cls({ wait: 155, buy_now: 11, fair_price: 920 }, "fair_price") },
  { ...node(1, null, null, null), value: cls({ wait: 0, buy_now: 1, fair_price: 12 }, "buy_now") },
  { ...node(2, null, null, null), value: cls({ wait: 74, buy_now: 0, fair_price: 524 }, "fair_price") },
];
const minority = ml.minorityLeaf(timing);
eq([minority.leaf.id, minority.winnerRows, minority.total], [1, 1, 13], "minority leaf found");
eq(Number(minority.weights.buy_now.toFixed(2)), 32.91, "balanced weight = N / (classes x rows)");
assert.ok(minority.weighted.buy_now > minority.weighted.fair_price, "weighted counts reproduce the winner");
checks += 1;
// A plurality winner under half (40/35/25) would win unweighted too: not reported as balanced weighting's doing.
const plurality = [
  { ...node(0, "days_listed", 1, 2), value: cls({ wait: 100, buy_now: 100, fair_price: 100 }, "fair_price") },
  { ...node(1, null, null, null), value: cls({ wait: 35, buy_now: 25, fair_price: 40 }, "fair_price") },
  { ...node(2, null, null, null), value: cls({ wait: 65, buy_now: 75, fair_price: 60 }, "buy_now") },
];
eq(ml.minorityLeaf(plurality), null, "plurality winners are not minority leaves");
eq(ml.treeFeatures(timing).map((t) => t.label), ["ราคาเทียบอดีตของร้านนี้"], "only features in the tree");
assert.ok(ml.treeFeatures(timing)[0].note.includes("ราคาที่ร้านนี้เคยตั้ง"), "historical percentile explained as such");
// "label: note" is printed: a note never adds a second colon (SPEC round 18).
for (const t of ml.treeFeatures([
  node(0, "pct_vs_model_median", 1, 2), node(1, "price_percentile_own", 3, 4), node(2, "pct_change_prev", 5, 6),
  node(3, "sales_per_day", 7, 8), node(4, "days_listed", 9, 10),
])) assert.ok(t.note && !t.note.includes(":"), `note: ${t.note}`);
// Every % threshold with one decimal.
eq(
  [ml.splitText("pct_change_prev", 0.06)[1], ml.splitText("pct_change_prev", 0.224)[1], ml.splitText("price_percentile_own", 0.44)[1]],
  ["≤ +6.0%", "≤ +22.4%", "≤ 44.0%"],
  "tree % thresholds",
);
checks += 1;

// ---- /ml formula boxes (lib/formula.ts): no character lost, Thai words and short math kept whole.
for (const [name, text] of Object.entries(fx.FORMULAS)) {
  const units = fx.formulaUnits(text);
  eq(units.join(" "), text, `formula ${name}: units give back the source`);
  // Each unit is one line: none may be wider than the box at 320 px (~30 mono characters).
  for (const u of units) assert.ok(u.length <= 30, `formula ${name}: unit too long: ${u}`);
}
checks += 1;
eq(fx.formulaUnits(fx.FORMULAS.ward), ["ต้นทุนการรวม", "A", "กับ", "B = (|A||B| / (|A| + |B|)) ·", "‖μ_A − μ_B‖²"], "ward: the bars stay");
assert.ok(fx.formulaUnits(fx.FORMULAS.kmeansRanked).includes("Σ‖x − μ_กลุ่ม‖²"), "k-means objective on one line");
assert.ok(fx.formulaUnits(fx.FORMULAS.kmeansRanked).includes("ต่ำสุด"), "Thai word whole");
eq(
  fx.formulaUnits(fx.FORMULAS.dealScore).slice(-3),
  ["Deal Score", "= 100", "× (1 − Φ(e / (s√(1 + h))))"],
  "a long run breaks only before operators outside brackets",
);
eq(fx.formulaUnits(fx.FORMULAS.cosine).slice(0, 3), ["cosine(a, b)", "= (a · b)", "/ (‖a‖ ‖b‖) ·"], "cosine: a · b inside brackets is not a separator");
eq(
  fx.formulaUnits(fx.FORMULAS.kmeansRates).slice(0, 3),
  ["X", "= [log(ยอดเข้าชม + 1),", "log(ยอดขายต่อวัน + 1),"],
  "a long bracketed list breaks after its commas",
);
checks += 3;

console.log(`check-demand: ${checks} checks passed`);
