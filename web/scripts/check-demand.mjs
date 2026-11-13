/**
 * Checks of the demand-evidence copy logic (src/lib/demand.ts), runnable with
 * plain Node: `npm run check:demand`. The web app has no test runner, so
 * this transpiles the two pure modules with the TypeScript compiler already
 * in devDependencies (type stripping only, no type check: `tsc --noEmit`
 * does that), loads them as CommonJS from a temp folder and asserts on the
 * strings a shopper would read. No new dependency.
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
for (const name of ["format", "demand"]) {
  const source = readFileSync(join(lib, `${name}.ts`), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  // .cjs so Node loads it as CommonJS whatever the nearest package.json says.
  writeFileSync(join(out, `${name}.cjs`), outputText.replaceAll('require("./format")', 'require("./format.cjs")'));
}
const d = createRequire(import.meta.url)(join(out, "demand.cjs"));
rmSync(out, { recursive: true, force: true });

const plain = (s) => (s === null ? null : s.replaceAll("|", ""));
/** v14 yardsticks: median views 5,300, median sales share 35%, best-seller split 1,732 views. */
const ref = {
  viewsMedian: 5300,
  salesBeatsMedian: 0.35,
  splitViews: 1731.9999999999995, // expm1(log1p(1732)) as Python used to store it
  groups: {},
};
const ev = (views, salesBeatsPct, driver = null, normalizedPrice = 0.9) => ({ views, salesBeatsPct, normalizedPrice, driver });
/** A v14 payload as stored, through the real reader. */
const demandGroups = () =>
  d.demandReference({
    segments: [{ label: "overpriced_hype", views_median: 104249, sales_beats_pct: 0.2, sales_beats_pct_median: 0.14 }],
    split_views: 26911,
    reference: { views_median: 30512, sales_beats_pct_median: 0.35 },
  });
let checks = 0;
const eq = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what);
  checks += 1;
};

// ---- M1: card contradiction line, in a shopper's words.
// niche ("คนดูน้อย ขายน้อย") with views above the median, decided by views
// itself: never "ยอดเข้าชมไม่ตรงชื่อกลุ่ม · อยู่กลุ่มนี้เพราะยอดเข้าชม".
eq(
  plain(d.cardConflict("niche", ev(9000, 0.1, "views"), ref)),
  "ยอดเข้าชมสูงกว่าค่ากลาง แต่โดยรวมยังคล้ายกลุ่มนี้ที่สุด",
  "M1 card: driver = mismatched views",
);
// hype ("คนดูเยอะ แต่ขายน้อย") with sales above the median, decided by sales:
eq(
  plain(d.cardConflict("overpriced_hype", ev(9000, 0.6, "sales"), ref)),
  "ยอดขายสูงกว่าค่ากลาง แต่โดยรวมยังคล้ายกลุ่มนี้ที่สุด",
  "M1 card: driver = mismatched sales",
);
// Same mismatch, decided by another feature: name the number, then the driver.
eq(
  plain(d.cardConflict("overpriced_hype", ev(9000, 0.6, "price"), ref)),
  "ยอดขายไม่ตรงชื่อกลุ่ม · อยู่กลุ่มนี้เพราะราคา",
  "M1 card: driver elsewhere (price)",
);
eq(
  plain(d.cardConflict("overpriced_hype", ev(9000, 0.6, "views"), ref)),
  "ยอดขายไม่ตรงชื่อกลุ่ม · อยู่กลุ่มนี้เพราะยอดเข้าชม",
  "M1 card: driver elsewhere (views)",
);
eq(
  plain(d.cardConflict("niche", ev(9000, 0.1, "sales"), ref)),
  "ยอดเข้าชมไม่ตรงชื่อกลุ่ม · อยู่กลุ่มนี้เพราะยอดขาย",
  "M1 card: driver elsewhere (sales)",
);
eq(
  plain(d.cardConflict("overpriced_hype", ev(9000, 0.6, null), ref)),
  "ยอดขายสูงกว่าค่ากลาง แต่โดยรวมยังคล้ายกลุ่มนี้ที่สุด",
  "M1 card: no driver stored",
);
// Both numbers contradict (hype with few views and good sales), decided by views:
eq(
  plain(d.cardConflict("overpriced_hype", ev(900, 0.6, "views"), ref)),
  "ยอดเข้าชมต่ำกว่าค่ากลาง และยอดขายสูงกว่าค่ากลาง แต่โดยรวมยังคล้ายกลุ่มนี้ที่สุด",
  "M1 card: both mismatched",
);
// A best seller's views are read against the split, not the median:
eq(
  plain(d.cardConflict("community_favorite", ev(900, 0.2, "sales"), ref)),
  "ยอดเข้าชมต่ำกว่าเส้นแบ่งรุ่นขายดี และยอดขายต่ำกว่าค่ากลาง แต่โดยรวมยังคล้ายกลุ่มนี้ที่สุด",
  "M1 card: best-seller yardstick",
);
for (const driver of ["views", "sales", "price", null]) {
  for (const [views, sales] of [[9000, 0.6], [900, 0.6], [900, 0.1], [9000, 0.1]]) {
    for (const cluster of ["hidden_gem", "community_favorite", "overpriced_hype", "niche"]) {
      const line = d.cardConflict(cluster, ev(views, sales, driver), ref);
      if (line !== null) assert.ok(!/มิติ|ชี้ขาด|ใกล้กลุ่ม/.test(line), `no jargon on cards: ${line}`);
    }
  }
}
checks += 1;

// ---- Product page: contradiction first, plain reason, method behind a disclosure.
eq(
  d.demandWhy("overpriced_hype", ev(9000, 0.6, "sales"), ref),
  {
    lead: "ตัวเลขของรุ่นนี้",
    why: "ยอดขายไม่ตรงกับชื่อกลุ่ม คนดูมากกว่าค่ากลางของทุกรุ่น (5,300 ครั้ง) และขายดีกว่า 60% ของสินค้าในร้านเดียวกัน สูงกว่าค่ากลางของทุกรุ่น (35%)",
    reason: "เมื่อดูยอดเข้าชม ยอดขาย และราคารวมกัน รุ่นนี้ยังคล้ายกลุ่มนี้มากกว่ากลุ่มอื่น",
    method: `กลุ่มจัดด้วย K-Means จาก ${d.DIMENSION_COUNT} อย่างพร้อมกัน (${d.DIMENSIONS_TEXT}) ไม่ได้ตัดที่ค่ากลางทีละตัว รุ่นหนึ่งจึงอยู่ในกลุ่มได้แม้ตัวเลขบางตัวไม่ตรงชื่อกลุ่ม`,
  },
  "page: driver = mismatched number",
);
eq(
  d.demandWhy("overpriced_hype", ev(9000, 0.6, "price", 0.82), ref).reason,
  "รุ่นนี้อยู่กลุ่มนี้เพราะราคาเป็นหลัก: ราคาต่ำสุดที่มีของตอนนี้ถูกกว่าราคากลางของรุ่นนี้ 18%",
  "page: price driver as a percent",
);
eq(
  d.demandWhy("overpriced_hype", ev(9000, 0.6, "price", 1.07), ref, false).reason,
  "รุ่นนี้อยู่กลุ่มนี้เพราะราคาเป็นหลัก: ราคาล่าสุดที่ต่ำที่สุด (ตอนนี้หมดทุกร้าน) แพงกว่าราคากลางของรุ่นนี้ 7%",
  "page: price driver, sold out everywhere",
);
eq(d.priceGapText(1.004, true), null, "price gap under 1%: nothing to quote");
eq(
  d.demandWhy("overpriced_hype", ev(9000, 0.6, "price", 1.004), ref).reason,
  "รุ่นนี้อยู่กลุ่มนี้เพราะราคาเป็นหลัก",
  "page: price driver with a gap under 1% stops at เป็นหลัก",
);
eq(
  d.demandWhy("niche", ev(9000, 0.1, "sales"), ref).reason,
  "รุ่นนี้อยู่กลุ่มนี้เพราะยอดขายเป็นหลัก",
  "page: another feature decided",
);
eq(
  d.demandWhy("overpriced_hype", ev(9000, 0.1, "views"), ref),
  {
    lead: "ที่ได้กลุ่มนี้",
    why: "คนดูมากกว่าค่ากลางของทุกรุ่น (5,300 ครั้ง) แต่ขายดีกว่าแค่ 10% ของสินค้าในร้านเดียวกัน ต่ำกว่าค่ากลางของทุกรุ่น (35%)",
    reason: null,
    method: null,
  },
  "page: numbers agree with the name",
);
eq(d.DIMENSION_COUNT, 3, "three clustered features today");

// ---- Card sales wording and the withheld-badge line.
eq(plain(d.salesText(ev(100, 0.12), false, true)), "ขายดีกว่าแค่ 12% ของสินค้าในร้าน", "below the median: แค่");
eq(plain(d.salesText(ev(100, 0.6), false, false)), "ขายดีกว่า 60% ของสินค้าในร้าน", "at or above: plain");
eq(d.evidenceSides("niche", ev(100, 0.12), ref).sales, "below", "12% vs 35% is below");
eq(d.evidenceSides("niche", ev(100, 0.352), ref).sales, "near", "35% vs 35% is near (plain form)");
eq(
  plain(d.withheldLine("overpriced_hype", ev(31200, 0.12), ref)),
  "กลุ่ม: คนดูเยอะ แต่ขายน้อย (คนดู 31,200 ครั้ง · ขายดีกว่าแค่ 12%)",
  "withheld badge: one line",
);
eq(
  plain(d.withheldLine("hidden_gem", ev(900, 0.8), ref)),
  "กลุ่ม: ขายดี แต่คนดูน้อย (คนดู 900 ครั้ง · ขายดีกว่า 80%)",
  "withheld badge: above the median",
);
eq(plain(d.withheldLine("overpriced_hype", ev(null, null), ref)), "กลุ่ม: คนดูเยอะ แต่ขายน้อย (ยังไม่มีตัวเลข)", "withheld: no numbers");
eq(
  plain(d.withheldLine("overpriced_hype", ev(31200, 0), ref)),
  "กลุ่ม: คนดูเยอะ แต่ขายน้อย (คนดู 31,200 ครั้ง · ยังไม่ขายดีกว่าสินค้าใด)",
  "withheld: raw zero",
);
eq(
  plain(d.withheldLine("overpriced_hype", ev(null, 0.004), ref)),
  "กลุ่ม: คนดูเยอะ แต่ขายน้อย (ไม่มีข้อมูลยอดเข้าชม · ขายดีกว่าไม่ถึง 1%)",
  "withheld: views missing, tiny share",
);

// A withheld card still admits a contradiction (hype with few views / good sales):
eq(
  plain(d.withheldLine("overpriced_hype", ev(120, 0.6, "price"), ref)),
  "กลุ่ม: คนดูเยอะ แต่ขายน้อย (คนดู 120 ครั้ง · ขายดีกว่า 60%) · อยู่กลุ่มนี้เพราะราคา",
  "withheld + mismatch: another feature decided",
);
eq(
  plain(d.withheldLine("overpriced_hype", ev(120, 0.6, "views"), ref)),
  "กลุ่ม: คนดูเยอะ แต่ขายน้อย (คนดู 120 ครั้ง · ขายดีกว่า 60%) · ตัวเลขไม่ตรงชื่อกลุ่ม แต่โดยรวมยังคล้ายกลุ่มนี้ที่สุด",
  "withheld + mismatch: driver is a mismatched number",
);
eq(
  plain(d.withheldLine("overpriced_hype", ev(120, 0.6, null), ref)),
  "กลุ่ม: คนดูเยอะ แต่ขายน้อย (คนดู 120 ครั้ง · ขายดีกว่า 60%) · ตัวเลขไม่ตรงชื่อกลุ่ม แต่โดยรวมยังคล้ายกลุ่มนี้ที่สุด",
  "withheld + mismatch: no driver stored",
);
eq(
  plain(d.withheldLine("overpriced_hype", ev(120, 0.6, "price"), d.NO_REFERENCE)),
  "กลุ่ม: คนดูเยอะ แต่ขายน้อย (คนดู 120 ครั้ง · ขายดีกว่า 60%)",
  "withheld: nothing to compare with, nothing admitted",
);
for (const driver of ["views", "sales", "price", null]) {
  for (const [views, sales] of [[9000, 0.6], [900, 0.6], [900, 0.1], [9000, 0.1]]) {
    for (const cluster of ["hidden_gem", "community_favorite", "overpriced_hype", "niche"]) {
      const e = ev(views, sales, driver);
      const m = d.nameMismatch(cluster, e, ref);
      const admits = / · (อยู่กลุ่มนี้|ตัวเลขไม่ตรง)/.test(plain(d.withheldLine(cluster, e, ref)));
      assert.equal(admits, m.views || m.sales, `withheld line admits exactly the mismatches: ${cluster} ${views} ${sales} ${driver}`);
      assert.ok(!/มิติ|ชี้ขาด|ใกล้กลุ่ม/.test(d.withheldLine(cluster, e, ref)), "no jargon on cards");
    }
  }
}
checks += 1;

// ---- Group line: both halves in the same shape.
const groups = demandGroups();
eq(
  d.groupComparison("overpriced_hype", groups),
  "รุ่นในกลุ่มนี้: ค่ากลางคนดู 104,249 ครั้ง (ทุกรุ่น 30,512 ครั้ง) · ค่ากลางยอดขาย: ขายดีกว่า ~14% ของสินค้าในร้าน (ทุกรุ่น ~35%)",
  "group comparison (v14)",
);
eq(
  d.groupNumbers("overpriced_hype", groups),
  "ค่ากลางคนดู 104,249 ครั้ง · ค่ากลางยอดขาย: ขายดีกว่า ~14% ของสินค้าในร้าน",
  "group numbers (v14)",
);
eq(
  d.groupComparison(
    "niche",
    d.demandReference({ segments: [{ label: "niche", views_median: 9889, sales_beats_pct: 0.11 }], split_views: 50 }),
  ),
  "รุ่นในกลุ่มนี้: ค่ากลางคนดู 9,889 ครั้ง · ค่าเฉลี่ยยอดขาย: ขายดีกว่า ~11% ของสินค้าในร้าน",
  "group comparison (v13 payload: mean, no overall part)",
);

// ---- M2: a best seller sitting exactly on the views split.
eq(d.compareSide(1732, 1731.9999999999995, Math.round), "near", "M2: on the split is not above it");
eq(d.compareSide(1732.0000001, 1732, (v) => v), "below", "M2: float noise alone is never 'above'");
eq(d.compareSide(1733, 1731.9999999999995, Math.round), "above", "M2: one view more is above");
eq(d.nameMismatch("hidden_gem", ev(1732, 0.8), ref), { views: false, sales: false }, "M2: hidden gem on the split");
eq(d.cardConflict("hidden_gem", ev(1732, 0.8, "views"), ref), null, "M2: no conflict line");
eq(d.nameMismatch("hidden_gem", ev(1733, 0.8), ref), { views: true, sales: false }, "M2: above the split does contradict");

// ---- M3: words follow the printed (rounded) numbers.
eq(d.compareSide(0.352, 0.349, (v) => Math.round(v * 100)), "near", "M3: 35% vs 35%");
eq(d.nameMismatch("niche", ev(100, 0.352), ref), { views: false, sales: false }, "M3: near is not a mismatch");
const near = d.demandWhy("niche", ev(100, 0.352), ref);
eq(
  near.why,
  "คนดูน้อยกว่าค่ากลางของทุกรุ่น (5,300 ครั้ง) และขายดีกว่า 35% ของสินค้าในร้านเดียวกัน ใกล้เคียงค่ากลางของทุกรุ่น (35%)",
  "M3 page: ใกล้เคียง, never สูงกว่า (35%)",
);
eq([near.lead, near.reason, near.method], ["ที่ได้กลุ่มนี้", null, null], "M3 page: no contradiction for a near number");
eq(plain(d.salesText(ev(100, 0))), "ยังไม่ขายดีกว่าสินค้าใดในร้าน", "M3: raw 0");
eq(plain(d.salesText(ev(100, 0.004))), "ขายดีกว่าไม่ถึง 1% ของสินค้าในร้าน", "M3: above 0, rounds to 0");
eq(plain(d.salesText(ev(100, 0.004), true)), "ขายดีกว่าไม่ถึง 1% ของสินค้าในร้านเดียวกัน", "M3: long form");
eq(plain(d.salesText(ev(100, 0.12))), "ขายดีกว่า 12% ของสินค้าในร้าน", "M3: ordinary share");
eq(d.salesShare(0), { kind: "zero", pct: 0 }, "M3: salesShare zero");
eq(d.salesShare(0.004), { kind: "tiny", pct: 0 }, "M3: salesShare tiny");
eq(
  d.demandWhy("niche", ev(100, 0.004), ref).why,
  "คนดูน้อยกว่าค่ากลางของทุกรุ่น (5,300 ครั้ง) และขายดีกว่าไม่ถึง 1% ของสินค้าในร้านเดียวกัน ต่ำกว่าค่ากลางของทุกรุ่น (35%)",
  "M3 page: tiny share",
);

// ---- Missing data is named, never printed as 0; old payloads compare nothing.
eq(d.evidenceParts(ev(null, null)).map(plain), ["ยังไม่มีตัวเลขยอดเข้าชมและยอดขายของรุ่นนี้"], "no numbers yet");
eq(d.evidenceParts(ev(1200, null)).map(plain), ["คนดู 1,200 ครั้ง", "ไม่มีข้อมูลยอดขาย"], "sales missing");
eq(d.evidenceParts(ev(null, 0.5)).map(plain), ["ไม่มีข้อมูลยอดเข้าชม", "ขายดีกว่า 50% ของสินค้าในร้าน"], "views missing");
eq(d.cardConflict("niche", ev(9000, 0.9, "price"), d.NO_REFERENCE), null, "no yardstick, no conflict");
eq(d.demandWhy("niche", ev(9000, 0.9), d.NO_REFERENCE), { lead: "ที่ได้กลุ่มนี้", why: null, reason: null, method: null }, "no yardstick, no sentence");
eq(d.demandReference({ segments: [{ label: "niche", views_median: 10, sales_beats_pct: 0.2 }], split_views: 50 }).groups.niche, {
  viewsMedian: 10,
  salesBeats: 0.2,
  salesBeatsIsMedian: false,
}, "v13 payload: mean, flagged as such");

console.log(`check-demand: ${checks} checks passed`);
