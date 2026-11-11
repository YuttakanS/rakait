"use client";

import { ChevronIcon } from "@/components/icons";

/**
 * A native <select> inside a GET form that submits on change. Without
 * JavaScript it still works: the form's submit button applies it.
 */
export function AutoSubmitSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <label className="relative flex min-w-[130px] flex-1 items-center sm:flex-none">
      <span className="sr-only">{label}</span>
      <select
        name={name}
        defaultValue={value}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-10 w-full appearance-none rounded-[var(--radius-control)] border border-border bg-surface pr-9 pl-3 text-base shadow-sm sm:text-sm focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft sm:w-44"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronIcon className="pointer-events-none absolute right-3 h-4 w-4 text-muted" />
    </label>
  );
}
