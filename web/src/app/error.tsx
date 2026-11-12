"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";

/**
 * Root error boundary (a page failed on the server, e.g. the database pool
 * was full): the RawBlock empty state inside the site chrome, in place of
 * Next's "Application error". No internal details are shown; the server log
 * keeps them.
 *
 * "ลองใหม่" refetches the server components (`router.refresh()`) and then
 * clears the boundary (`reset()`); `reset()` alone would only re-render the
 * failed client tree.
 *
 * A failure in the root layout itself is caught by `global-error.tsx`.
 */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  return (
    // role="alert": screen readers announce the failure as soon as the
    // boundary replaces the page (SPEC round 11).
    <section role="alert" className="card card-heavy space-y-4 p-8 sm:p-12">
      <h1 className="display text-3xl sm:text-5xl">ระบบกำลังยุ่ง</h1>
      <p className="max-w-xl text-sm text-muted">โหลดหน้านี้ไม่สำเร็จ ลองใหม่อีกครั้งในอีกสักครู่</p>
      <button
        type="button"
        className="btn btn-primary text-sm"
        onClick={() =>
          startTransition(() => {
            router.refresh();
            reset();
          })
        }
      >
        ลองใหม่
      </button>
    </section>
  );
}
