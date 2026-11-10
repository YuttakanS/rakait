import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import Link from "next/link";
import { getLastUpdated } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";
import "./globals.css";

const notoThai = Noto_Sans_Thai({
  variable: "--font-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "RakaIT – เทียบราคาอุปกรณ์คอม",
  description:
    "เทียบราคาการ์ดจอ ซีพียู แรม และ SSD จาก JIB, IHAVECPU และ BaNANA พร้อมราคายุติธรรมจาก Machine Learning",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const updated = await getLastUpdated().catch(() => null);
  return (
    <html lang="th">
      <body className={`${notoThai.variable} antialiased`}>
        <header className="border-b border-border bg-surface">
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight">
              Raka<span className="text-accent">IT</span>
            </Link>
            <Link href="/" className="text-sm hover:text-accent">
              สินค้า
            </Link>
            <Link href="/insights" className="text-sm hover:text-accent">
              Market Insights
            </Link>
            <span className="ml-auto text-xs text-muted">อัปเดตล่าสุด {formatDateTime(updated)}</span>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-muted">
          ข้อมูลจาก JIB, IHAVECPU และ BaNANA เก็บอัตโนมัติทุก 3 ชั่วโมง · ราคายุติธรรมและคำแนะนำคำนวณด้วย
          Linear Regression, Decision Tree และ K-Means · โปรเจกต์เพื่อการศึกษา
        </footer>
      </body>
    </html>
  );
}
