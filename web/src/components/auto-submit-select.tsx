"use client";

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
        className="h-11 w-full appearance-none border-[3px] border-border bg-surface-muted pr-9 pl-3 text-base hover:bg-surface sm:w-48 sm:text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {/* Text marker instead of a chevron icon (RawBlock: no icons). */}
      <span aria-hidden className="tabular pointer-events-none absolute right-3 text-sm font-bold">
        ↓
      </span>
    </label>
  );
}
