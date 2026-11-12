"use client";

import "./globals.css";

/**
 * Last-resort error boundary: the root layout itself failed, so `error.tsx`
 * (which renders inside that layout) cannot show. Next renders this file in
 * place of the whole document, hence its own `<html>` and `<body>`; the
 * RawBlock classes come from globals.css imported here. The site fonts are
 * not loaded (their variables are set by the layout), so text falls back to
 * the system Thai face. Same copy as `error.tsx`; no error message, digest or
 * stack.
 *
 * "ลองใหม่" reloads the page: the failure was on the server, and the router
 * context that `error.tsx` uses for `router.refresh()` sits inside the layout
 * that failed.
 */
export default function GlobalError() {
  return (
    <html lang="th">
      <head>
        <title>ระบบกำลังยุ่ง – RakaIT</title>
      </head>
      <body className="antialiased">
        <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
          <section role="alert" className="card card-heavy space-y-4 p-8 sm:p-12">
            <h1 className="display text-3xl sm:text-5xl">ระบบกำลังยุ่ง</h1>
            <p className="max-w-xl text-sm text-muted">โหลดหน้านี้ไม่สำเร็จ ลองใหม่อีกครั้งในอีกสักครู่</p>
            <button type="button" className="btn btn-primary text-sm" onClick={() => window.location.reload()}>
              ลองใหม่
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
