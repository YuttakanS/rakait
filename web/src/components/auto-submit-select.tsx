"use client";

/**
 * A native <select> inside a GET form that submits on change. Without
 * JavaScript it still works: the form's submit button applies it.
 *
 * It stays uncontrolled (the form reads the DOM value), so `defaultValue`
 * only applies on mount. A client-side navigation (navbar link, cluster chip,
 * back button) re-renders the page with a new `value` but keeps the same DOM
 * node, which would leave the select on the old option and submit a stale
 * value. `key={value}` remounts the element whenever the URL-derived value
 * changes: O(options) DOM work per navigation, no extra state or effect.
 *
 * `autoComplete="off"` stops the browser restoring the option the user last
 * picked when the back button reloads this document (the GET submit is a full
 * page load); without it the restored option overrides the server-rendered
 * one and the next change submits the wrong value.
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
        key={value}
        autoComplete="off"
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
