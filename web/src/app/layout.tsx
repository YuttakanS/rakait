import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { HeaderSearch, SearchForm } from "@/components/header-search";
import { UiIcon } from "@/components/icons";
import { SiteNav } from "@/components/site-nav";
import { IMAGE_ORIGINS } from "@/lib/images";
import { getLastUpdated } from "@/lib/queries";
import { MERCHANTS, formatDateTime, merchantList } from "@/lib/format";
import "./globals.css";

const notoThai = Noto_Sans_Thai({
  variable: "--font-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "RakaIT – เทียบราคาอุปกรณ์คอม",
  description: `เทียบราคาการ์ดจอ ซีพียู แรม และ SSD จาก ${merchantList()} พร้อมราคายุติธรรมจาก Machine Learning`,
};

/**
 * Header actions. A price-comparison site has no cart, account or delivery
 * tracking, so the action slots hold the three things a shopper here does.
 */
const SHORTCUTS = [
  { href: "/?sort=deal", label: "ดีลเด็ด", icon: "tag" },
  { href: "/?sort=stores", label: "เทียบหลายร้าน", icon: "scale" },
  { href: "/insights", label: "ภาพรวมตลาด", icon: "chart" },
] as const;

const FOOTER_LINKS = [
  { href: "/", label: "หน้าแรก" },
  { href: "/?sort=deal", label: "ดีลดีที่สุด" },
  { href: "/insights", label: "ภาพรวมตลาด" },
  { href: "/insights#advice", label: "ป้ายซื้อเลย / รอก่อน คิดจากอะไร" },
];

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const updated = await getLastUpdated().catch(() => null);
  return (
    <html lang="th">
      <head>
        {/* Open TLS connections to the merchant image CDNs while the HTML is
            still parsing, so the first thumbnails skip DNS + TCP + TLS
            (~100-300 ms per origin). Plain <link> tags: in the initial HTML,
            not deferred to the RSC payload. */}
        {IMAGE_ORIGINS.map((origin) => (
          <link key={origin} rel="preconnect" href={origin} />
        ))}
      </head>
      <body className={`${notoThai.variable} antialiased`}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-[var(--radius-control)] focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
        >
          ข้ามไปที่เนื้อหา
        </a>

        {/* Announcement bar: facts about the data, not a contact line we do not have. */}
        <div className="bg-topbar text-xs text-on-topbar">
          <div className="mx-auto flex h-9 max-w-7xl items-center gap-4 px-4">
            <span className="flex min-w-0 items-center gap-1.5 truncate">
              <UiIcon name="clock" className="h-3.5 w-3.5" />
              อัปเดตราคาล่าสุด {formatDateTime(updated)} · ทุก 3 ชั่วโมง
            </span>
            <span className="hidden truncate md:inline">เทียบราคาจาก {merchantList()}</span>
            <a href="#stores" className="ml-auto flex flex-none items-center gap-1.5 py-2 hover:text-white">
              <UiIcon name="store" className="h-3.5 w-3.5" />
              ร้านค้าที่เทียบราคา
            </a>
          </div>
        </div>

        <header className="border-b border-border bg-surface lg:sticky lg:top-0 lg:z-20">
          <div className="mx-auto grid max-w-7xl grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 px-4 py-3 lg:grid-cols-[auto_1fr_auto] lg:py-4">
            <Link href="/" className="flex items-center gap-2.5" aria-label="RakaIT หน้าแรก">
              <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-control)] bg-accent text-lg font-black text-on-accent shadow-sm">
                R
              </span>
              <span className="leading-none">
                <span className="block text-2xl font-black tracking-tight">
                  Raka<span className="text-accent">IT</span>
                </span>
                <span className="mt-1 hidden text-[11px] font-medium text-muted sm:block">เทียบราคาอุปกรณ์คอม</span>
              </span>
            </Link>

            <nav aria-label="ทางลัด" className="col-start-2 justify-self-end lg:col-start-3">
              <ul className="flex items-center gap-1">
                {SHORTCUTS.map((s) => (
                  <li key={s.href}>
                    <Link
                      href={s.href}
                      className="flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-control)] px-2 text-muted transition-colors hover:bg-accent-soft hover:text-accent"
                    >
                      <UiIcon name={s.icon} className="h-5 w-5" />
                      <span className="hidden text-[11px] font-medium sm:block">{s.label}</span>
                      <span className="sr-only sm:hidden">{s.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="col-span-2 lg:col-span-1 lg:col-start-2 lg:row-start-1">
              <Suspense fallback={<SearchForm />}>
                <HeaderSearch />
              </Suspense>
            </div>
          </div>

          <div className="border-t border-border">
            <div className="mx-auto max-w-7xl px-4 py-1.5">
              <SiteNav />
            </div>
          </div>
        </header>

        <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
          {children}
        </main>

        <footer id="stores" className="mt-8 border-t border-border bg-surface">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
            <div className="space-y-3">
              <p className="text-xl font-black tracking-tight">
                Raka<span className="text-accent">IT</span>
              </p>
              <p className="max-w-md text-sm leading-relaxed text-muted">
                รวมราคาการ์ดจอ ซีพียู แรม และ SSD รุ่นเดียวกันจากหลายร้านไว้ในหน้าเดียว พร้อมราคายุติธรรมที่ประเมินจากสเปก
                เพื่อให้รู้ว่าราคาที่เห็นถูกหรือแพง
              </p>
            </div>
            <div>
              <h2 className="text-sm font-semibold">ร้านค้าที่เทียบราคา</h2>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                {MERCHANTS.map((m) => (
                  <li key={m.slug} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: `var(--store-${m.slug})` }} aria-hidden />
                    {m.name}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-sm font-semibold">เมนู</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {FOOTER_LINKS.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-muted hover:text-accent">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mx-auto max-w-7xl border-t border-border px-4 py-5 text-xs leading-relaxed text-subtle">
            ข้อมูลจาก {merchantList()} เก็บอัตโนมัติทุก 3 ชั่วโมง · รูปสินค้าเป็นของแต่ละร้าน · ราคายุติธรรมและคำแนะนำคำนวณด้วย
            Linear Regression, Decision Tree และ K-Means · RakaIT ไม่ได้ขายสินค้าเอง กดซื้อแล้วจะไปที่เว็บของร้าน · โปรเจกต์เพื่อการศึกษา
          </p>
        </footer>
      </body>
    </html>
  );
}
