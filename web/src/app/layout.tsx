import type { Metadata } from "next";
import { Archivo_Black, Kanit, Noto_Sans_Thai, Space_Mono, Work_Sans } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { HeaderSearch, SearchForm } from "@/components/header-search";
import { SiteNav } from "@/components/site-nav";
import { IMAGE_ORIGINS } from "@/lib/images";
import { getLastUpdated } from "@/lib/queries";
import { MERCHANTS, formatDateTime, merchantList } from "@/lib/format";
import "./globals.css";

/*
 * RawBlock faces (.claude/skills/design.md §3): Archivo Black for headlines, Work Sans for
 * body, Space Mono for numbers. None has Thai glyphs, so each stack in
 * globals.css falls through to a Thai partner: Kanit 700 for headlines and
 * Noto Sans Thai for body and mono. All self-hosted by next/font (no request
 * to Google at runtime); only the subsets listed are preloaded.
 */
const archivo = Archivo_Black({ variable: "--font-archivo", subsets: ["latin"], weight: "400" });
const work = Work_Sans({ variable: "--font-work", subsets: ["latin"] });
const spaceMono = Space_Mono({ variable: "--font-space-mono", subsets: ["latin"], weight: ["400", "700"] });
const kanit = Kanit({ variable: "--font-kanit", subsets: ["thai"], weight: "700" });
const notoThai = Noto_Sans_Thai({ variable: "--font-thai", subsets: ["thai"] });
const FONT_VARS = [archivo, work, spaceMono, kanit, notoThai].map((f) => f.variable).join(" ");

export const metadata: Metadata = {
  title: "RakaIT – เทียบราคาอุปกรณ์คอม",
  description: `เทียบราคาการ์ดจอ ซีพียู แรม และ SSD จาก ${merchantList()} พร้อมราคายุติธรรมจาก Machine Learning`,
};

/**
 * Header actions. A price-comparison site has no cart, account or delivery
 * tracking, so the action slots hold the three things a shopper here does.
 */
const SHORTCUTS = [
  { href: "/?sort=deal", label: "ดีลเด็ด" },
  { href: "/?sort=stores", label: "เทียบหลายร้าน" },
  { href: "/insights", label: "ภาพรวมตลาด" },
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
    // Font variables sit on <html> so :root can resolve the stacks in globals.css.
    <html lang="th" className={FONT_VARS}>
      <head>
        {/* Open TLS connections to the merchant image CDNs while the HTML is
            still parsing, so the first thumbnails skip DNS + TCP + TLS
            (~100-300 ms per origin). Plain <link> tags: in the initial HTML,
            not deferred to the RSC payload. */}
        {IMAGE_ORIGINS.map((origin) => (
          <link key={origin} rel="preconnect" href={origin} />
        ))}
      </head>
      <body className="antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-foreground focus:px-4 focus:py-2 focus:text-background"
        >
          ข้ามไปที่เนื้อหา
        </a>

        {/* Announcement bar: facts about the data, not a contact line we do not have. Inverted block. */}
        <div className="inverted text-xs">
          <div className="mx-auto flex h-9 max-w-7xl items-center gap-4 px-4">
            <span className="min-w-0 truncate">
              อัปเดตราคาล่าสุด <span className="tabular">{formatDateTime(updated)}</span> · ทุก 3 ชั่วโมง
            </span>
            <span className="hidden truncate text-muted md:inline">เทียบราคาจาก {merchantList()}</span>
            <a href="#stores" className="ml-auto flex-none px-2 py-2 underline underline-offset-2 hover:decoration-2">
              ร้านค้าที่เทียบราคา
            </a>
          </div>
        </div>

        <header className="border-b-[3px] border-border bg-surface lg:sticky lg:top-0 lg:z-20">
          <div className="mx-auto grid max-w-7xl grid-cols-[auto_1fr] items-center gap-x-3 gap-y-3 sm:gap-x-6 px-4 py-3 lg:grid-cols-[auto_1fr_auto] lg:py-4">
            <Link href="/" className="flex items-center gap-2" aria-label="RakaIT หน้าแรก">
              <span className="display hidden h-10 w-10 items-center justify-center bg-foreground text-xl text-background sm:flex">
                R
              </span>
              <span className="leading-none">
                <span className="display block text-2xl leading-none">
                  Raka<span className="bg-foreground px-0.5 text-background">IT</span>
                </span>
                <span className="mt-1 hidden text-xs font-medium text-muted sm:block">เทียบราคาอุปกรณ์คอม</span>
              </span>
            </Link>

            {/* min-w-0 + flex-wrap: below ~340 px the three shortcuts do not fit
                beside the logo, so the last one drops to a second line instead
                of pushing the page sideways (SPEC round 11). */}
            <nav aria-label="ทางลัด" className="col-start-2 min-w-0 justify-self-end lg:col-start-3">
              <ul className="flex flex-wrap items-center justify-end">
                {SHORTCUTS.map((s) => (
                  <li key={s.href}>
                    <Link
                      href={s.href}
                      className="flex min-h-11 items-center px-1.5 text-xs font-semibold whitespace-nowrap underline-offset-4 hover:underline sm:px-3 sm:text-sm"
                    >
                      {s.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="col-span-2 min-w-0 lg:col-span-1 lg:col-start-2 lg:row-start-1">
              <Suspense fallback={<SearchForm />}>
                <HeaderSearch />
              </Suspense>
            </div>
          </div>

          <div className="border-t-[3px] border-border">
            <div className="mx-auto max-w-7xl px-4 py-1.5">
              <SiteNav />
            </div>
          </div>
        </header>

        <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
          {children}
        </main>

        <footer id="stores" className="mt-8 border-t-[3px] border-border bg-surface">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
            <div className="space-y-3">
              <p className="display text-2xl">
                Raka<span className="bg-foreground px-0.5 text-background">IT</span>
              </p>
              <p className="max-w-md text-sm leading-relaxed text-muted">
                รวมราคาการ์ดจอ ซีพียู แรม และ SSD รุ่นเดียวกันจากหลายร้านไว้ในหน้าเดียว พร้อมราคายุติธรรมที่ประเมินจากสเปก
                เพื่อให้รู้ว่าราคาที่เห็นถูกหรือแพง
              </p>
            </div>
            <div>
              <h2 className="display text-base">ร้านค้าที่เทียบราคา</h2>
              <ul className="mt-3 divide-y-2 divide-border border-y-2 border-border text-sm">
                {MERCHANTS.map((m) => (
                  <li key={m.slug} className="py-2">
                    {m.name}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="display text-base">เมนู</h2>
              <ul className="mt-3 space-y-1 text-sm">
                {FOOTER_LINKS.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="link inline-block py-1">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mx-auto max-w-7xl border-t-2 border-border px-4 py-5 text-xs leading-relaxed text-subtle">
            ข้อมูลจาก {merchantList()} เก็บอัตโนมัติทุก 3 ชั่วโมง · รูปสินค้าเป็นของแต่ละร้าน · ราคายุติธรรมและคำแนะนำคำนวณด้วย
            Linear Regression, Decision Tree และ K-Means · RakaIT ไม่ได้ขายสินค้าเอง กดซื้อแล้วจะไปที่เว็บของร้าน · โปรเจกต์เพื่อการศึกษา
          </p>
        </footer>
      </body>
    </html>
  );
}
