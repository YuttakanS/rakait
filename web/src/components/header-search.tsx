"use client";

import { useSearchParams } from "next/navigation";
import { SearchIcon } from "@/components/icons";

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
      <label className="relative flex flex-1 items-center">
        <span className="sr-only">ค้นหาสินค้า</span>
        <SearchIcon className="pointer-events-none absolute left-3.5 h-4 w-4 text-muted" />
        <input
          name="q"
          defaultValue={query}
          placeholder="ค้นหารุ่น เช่น RTX 5060, 7800X3D, DDR5 32GB"
          className="h-11 w-full rounded-l-[var(--radius-control)] border-2 border-r-0 border-accent bg-surface pr-3 pl-10 text-base placeholder:text-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft sm:text-sm"
        />
      </label>
      <button className="h-11 flex-none rounded-r-[var(--radius-control)] bg-accent px-4 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-accent-soft focus-visible:outline-none sm:px-6">
        <SearchIcon className="h-4 w-4 sm:hidden" />
        <span className="sr-only sm:not-sr-only">ค้นหา</span>
      </button>
    </form>
  );
}
