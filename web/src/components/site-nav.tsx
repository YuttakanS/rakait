"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CategoryGlyph, ChevronIcon, UiIcon } from "@/components/icons";
import { CATEGORY_LABELS } from "@/lib/format";
import type { Category } from "@/lib/types";

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];

const CATEGORY_HINTS: Record<Category, string> = {
  gpu: "GeForce, Radeon, Arc",
  cpu: "Ryzen, Core Ultra, Core i",
  ram: "DDR4, DDR5 สำหรับเดสก์ท็อป",
  ssd: "NVMe, SATA",
};

/**
 * Category menu button + the main links. Client-side only for the open state
 * of the menu and for marking the current page; every item is a plain link,
 * so the bar still works without JavaScript (the menu stays closed and the
 * inline category links remain). It reads the pathname only, not the query
 * string, so prerendered pages keep it in their static HTML.
 */
export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

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

  const links: { href: string; label: string; active: boolean }[] = [
    { href: "/", label: "หน้าแรก", active: pathname === "/" },
    ...CATEGORIES.map((c) => ({ href: `/?category=${c}`, label: CATEGORY_LABELS[c], active: false })),
    { href: "/insights", label: "ภาพรวมตลาด", active: pathname.startsWith("/insights") },
  ];

  return (
    <div className="flex items-center gap-2">
      <div ref={menu} className="relative flex-none">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="category-menu"
          className="flex h-11 items-center gap-2 rounded-[var(--radius-control)] bg-accent px-4 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-accent-soft focus-visible:outline-none"
        >
          <UiIcon name="menu" className="h-4 w-4" />
          หมวดหมู่สินค้า
          <ChevronIcon className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div
            id="category-menu"
            className="card absolute top-full left-0 z-30 mt-2 w-72 p-2"
          >
            <ul>
              {CATEGORIES.map((c) => (
                <li key={c}>
                  <Link
                    href={`/?category=${c}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 hover:bg-accent-soft"
                  >
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[var(--radius-control)] bg-surface-muted text-accent">
                      <CategoryGlyph category={c} className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{CATEGORY_LABELS[c]}</span>
                      <span className="block truncate text-xs text-muted">{CATEGORY_HINTS[c]}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href="/?sort=deal"
              onClick={() => setOpen(false)}
              className="mt-1 flex items-center justify-between border-t border-border px-3 pt-3 pb-1.5 text-sm font-medium text-accent hover:underline"
            >
              ดูดีลดีที่สุดทุกหมวด
              <UiIcon name="arrow" className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
      <ul className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
        {links.map((l) => (
          <li key={l.href} className="flex-none">
            <Link
              href={l.href}
              aria-current={l.active ? "page" : undefined}
              className={`flex h-11 items-center rounded-[var(--radius-control)] px-3 text-sm font-medium transition-colors ${
                l.active ? "text-accent" : "text-foreground hover:text-accent"
              }`}
            >
              <span className={l.active ? "border-b-2 border-accent pb-0.5" : "pb-0.5"}>{l.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
