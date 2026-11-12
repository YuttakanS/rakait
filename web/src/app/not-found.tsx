import Link from "next/link";

/**
 * 404 (unknown route or product id): the RawBlock empty state, inside the
 * site chrome, with one way back.
 */
export default function NotFound() {
  return (
    <section className="card card-heavy space-y-4 p-8 sm:p-12">
      <p className="tabular caps text-sm font-bold">404</p>
      <h1 className="display text-3xl sm:text-5xl">ไม่พบหน้านี้</h1>
      <p className="max-w-xl text-sm text-muted">ลิงก์อาจผิด หรือสินค้านี้ไม่มีขายแล้ว</p>
      <Link href="/" className="btn btn-primary text-sm">
        กลับไปหน้ารวม <span aria-hidden>→</span>
      </Link>
    </section>
  );
}
