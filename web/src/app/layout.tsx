import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import Link from "next/link";
import { IMAGE_ORIGINS } from "@/lib/images";
import { getLastUpdated } from "@/lib/queries";
import { formatDateTime, merchantList } from "@/lib/format";
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
        <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="text-xl font-bold tracking-tight text-foreground">
              Raka<span className="text-accent">IT</span>
            </Link>
            <Link href="/" className="text-sm font-medium text-muted hover:text-accent">
              สินค้า
            </Link>
            <Link href="/insights" className="text-sm font-medium text-muted hover:text-accent">
              ภาพรวมตลาด
            </Link>
            <span className="ml-auto text-xs text-muted">อัปเดตล่าสุด {formatDateTime(updated)}</span>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs leading-relaxed text-subtle">
          ข้อมูลจาก {merchantList()} เก็บอัตโนมัติทุก 3 ชั่วโมง · รูปสินค้าเป็นของแต่ละร้าน · ราคายุติธรรมและคำแนะนำคำนวณด้วย
          Linear Regression, Decision Tree และ K-Means · โปรเจกต์เพื่อการศึกษา
        </footer>
      </body>
    </html>
  );
}
