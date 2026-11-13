"use client";

import { useState, type ReactNode } from "react";

export interface TabPanel {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Filter-chip toggle between server-rendered panels (one per category).
 * Every panel is in the HTML; the others are only `hidden`, so switching is
 * instant and needs no request. Chips are 44 px buttons with `aria-pressed`
 * (design.md §5 filter chips); the active one is a black block.
 */
export function CategoryTabs({ panels, label }: { panels: TabPanel[]; label: string }) {
  const [active, setActive] = useState(panels[0]?.id ?? "");
  if (panels.length === 0) return null;
  return (
    <div className="space-y-4">
      {panels.length > 1 && (
        <div role="group" aria-label={label} className="flex flex-wrap gap-2">
          {panels.map((p) => {
            const on = p.id === active;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                onClick={() => setActive(p.id)}
                className={`inline-flex min-h-11 items-center border-2 border-border px-3 text-sm font-medium ${
                  on
                    ? "bg-foreground text-background focus-visible:outline-offset-2"
                    : "bg-surface hover:bg-foreground hover:text-background"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}
      {panels.map((p) => (
        <div key={p.id} hidden={p.id !== active} className="min-w-0">
          {p.content}
        </div>
      ))}
    </div>
  );
}
