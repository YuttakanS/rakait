"use client";

import { useSearchParams } from "next/navigation";

/**
 * The header's site-wide search: a GET form to the product list, prefilled
 * from ?q= so the term stays visible on the results page. The category in the
 * URL is kept, so searching inside "การ์ดจอ" stays in การ์ดจอ.
 */
export function HeaderSearch() {
  const params = useSearchParams();
  return <SearchForm query={params.get("q") ?? ""} category={params.get("category") ?? ""} />;
}

/** Static markup, also the Suspense fallback on prerendered pages. */
export function SearchForm({ query = "", category = "" }: { query?: string; category?: string }) {
  return (
    <form action="/" role="search" className="flex w-full">
      {category && <input type="hidden" name="category" value={category} />}
      <label className="flex flex-1 items-center">
        <span className="sr-only">ค้นหาสินค้า</span>
        <input
          name="q"
          defaultValue={query}
          placeholder="ค้นหารุ่น เช่น RTX 5060, 7800X3D, DDR5 32GB"
          className="tabular h-11 w-full min-w-0 border-[3px] border-r-0 border-border bg-surface-muted px-3 text-base placeholder:text-subtle hover:bg-surface sm:text-[15px]"
        />
      </label>
      <button className="btn btn-primary flex-none px-4 text-sm sm:px-6">ค้นหา</button>
    </form>
  );
}
