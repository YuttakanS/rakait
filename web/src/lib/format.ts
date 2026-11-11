import type { Category, DemandCluster, Recommendation } from "@/lib/types";

const thb = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });

export function formatTHB(value: number | null | undefined): string {
  return value === null || value === undefined ? "–" : `฿${thb.format(value)}`;
}

export function formatPct(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return "–";
  const pct = (value * 100).toFixed(digits);
  return `${value > 0 ? "+" : ""}${pct}%`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  });
}

export const CATEGORY_LABELS: Record<Category, string> = {
  gpu: "การ์ดจอ",
  cpu: "ซีพียู",
  ram: "แรม",
  ssd: "SSD",
};

export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  buy_now: "ซื้อเลย",
  wait: "รอก่อน",
  fair_price: "ราคาเหมาะสม",
};

export const CLUSTER_LABELS: Record<DemandCluster, { label: string; hint: string }> = {
  hidden_gem: { label: "ช้างเผือก", hint: "ยอดเข้าชมน้อย แต่ขายดี" },
  community_favorite: { label: "ขวัญใจชุมชน", hint: "คนดูเยอะและซื้อจริง" },
  overpriced_hype: { label: "กระแสแรง ขายไม่ออก", hint: "คนดูเยอะ แต่ยอดขายต่ำ" },
  niche: { label: "เฉพาะกลุ่ม", hint: "ยอดเข้าชมและยอดขายต่ำ" },
};

/** Stores the platform scrapes, in display order. Copy derives from this list. */
export const MERCHANTS: readonly { slug: string; name: string }[] = [
  { slug: "jib", name: "JIB" },
  { slug: "ihavecpu", name: "IHAVECPU" },
  { slug: "banana", name: "BaNANA" },
  { slug: "itcity", name: "IT City" },
];

/** "JIB, IHAVECPU, BaNANA และ IT City" */
export function merchantList(): string {
  const names = MERCHANTS.map((m) => m.name);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} และ ${names.at(-1)}` : (names[0] ?? "");
}

export const MERCHANT_COLORS: Record<string, string> = {
  jib: "var(--store-jib)",
  ihavecpu: "var(--store-ihavecpu)",
  banana: "var(--store-banana)",
  itcity: "var(--store-itcity)",
};
