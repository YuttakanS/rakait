"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { CATEGORY_LABELS } from "@/lib/format";
import type { Category } from "@/lib/types";

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];

const CATEGORY_HINTS: Record<Category, string> = {
  gpu: "GeForce, Radeon, Arc",
  cpu: "Ryzen, Core Ultra, Core i",
  ram: "DDR4, DDR5 สำหรับเดสก์ท็อป",
  ssd: "NVMe, SATA",
};

/** The category marked as current: "/" with a known `?category=`, else none. */
type ActiveCategory = { onHome: boolean; category: Category | null };

/**
 * Pathname + `?category=` narrowed to a known category (anything else means
 * "all"). `useSearchParams` makes a prerendered page bail out to the nearest
 * `<Suspense>` fallback, so callers sit inside one whose fallback is the same
 * markup with `category: null`. That fallback is already right on the static
 * pages (/insights, /product/...) because category links only match on "/".
 */
function useActiveCategory(): ActiveCategory {
  const onHome = usePathname() === "/";
  const value = useSearchParams().get("category");
  return { onHome, category: CATEGORIES.find((c) => c === value) ?? null };
}

/**
 * Category menu button + the main links. Client-side only for the open state
 * of the menu and for marking the current page; every item is a plain link,
 * so the bar still works without JavaScript (the menu stays closed and the
 * inline category links remain).
 *
 * The button and its state stay outside any `<Suspense>`, so it hydrates with
 * the rest of the header as before; only the parts that read the query are
 * wrapped.
 */
export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const noQuery: ActiveCategory = { onHome: pathname === "/", category: null };

  // Close on outside click and Escape; menu links close it on click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="flex items-center gap-2">
      <div ref={menu} className="relative flex-none">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="category-menu"
          className="btn btn-primary gap-3 px-4 text-sm"
        >
          หมวดหมู่สินค้า
          <span aria-hidden className="disclosure" />
        </button>
        {open && (
          <div id="category-menu" className="card absolute top-full left-0 z-30 mt-1 w-72">
            <Suspense fallback={<MenuItems active={noQuery} onPick={() => setOpen(false)} />}>
              <MenuItemsFromUrl onPick={() => setOpen(false)} />
            </Suspense>
            <Link
              href="/?sort=deal"
              onClick={() => setOpen(false)}
              className="link block border-t-[3px] border-border px-4 py-3 text-sm font-medium"
            >
              ดูดีลดีที่สุดทุกหมวด <span aria-hidden>→</span>
            </Link>
          </div>
        )}
      </div>
      <Suspense fallback={<NavLinks active={noQuery} />}>
        <NavLinksFromUrl />
      </Suspense>
    </div>
  );
}

function MenuItemsFromUrl({ onPick }: { onPick: () => void }) {
  return <MenuItems active={useActiveCategory()} onPick={onPick} />;
}

/** Category menu entries; the current category is a black block. */
function MenuItems({ active, onPick }: { active: ActiveCategory; onPick: () => void }) {
  return (
    <ul className="divide-y-[3px] divide-border">
      {CATEGORIES.map((c) => {
        const current = active.onHome && active.category === c;
        return (
          <li key={c}>
            <Link
              href={`/?category=${c}`}
              onClick={onPick}
              aria-current={current ? "page" : undefined}
              className={`block px-4 py-2.5 ${
                current
                  ? "bg-foreground text-background focus-visible:-outline-offset-4 focus-visible:outline-background"
                  : "hover:bg-foreground hover:text-background"
              }`}
            >
              <span className="block text-sm font-semibold">{CATEGORY_LABELS[c]}</span>
              <span className="block truncate text-xs">{CATEGORY_HINTS[c]}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function NavLinksFromUrl() {
  return <NavLinks active={useActiveCategory()} />;
}

/**
 * The inline link row. Active rules: a category link on "/" with that
 * `?category=` (sort, cluster and q do not matter); "หน้าแรก" on "/" with no
 * category; "ภาพรวมตลาด" under /insights.
 */
function NavLinks({ active }: { active: ActiveCategory }) {
  const pathname = usePathname();
  const links: { href: string; label: string; active: boolean }[] = [
    { href: "/", label: "หน้าแรก", active: active.onHome && active.category === null },
    ...CATEGORIES.map((c) => ({
      href: `/?category=${c}`,
      label: CATEGORY_LABELS[c],
      active: active.onHome && active.category === c,
    })),
    { href: "/insights", label: "ภาพรวมตลาด", active: pathname.startsWith("/insights") },
  ];

  return (
    <ul className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
      {links.map((l) => (
        <li key={l.href} className="flex-none">
          <Link
            href={l.href}
            aria-current={l.active ? "page" : undefined}
            className={`flex h-11 items-center px-3 text-sm font-medium focus-visible:-outline-offset-4 ${
              l.active
                ? "bg-foreground text-background focus-visible:outline-background"
                : "underline-offset-4 hover:underline"
            }`}
          >
            {l.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
