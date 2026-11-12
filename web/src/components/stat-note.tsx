"use client";

import { useId, useState } from "react";

/**
 * Small grey statistic marked "(i)" whose full detail opens on tap, click or
 * Enter / Space (SPEC round 11: a `title` tooltip never shows on a phone and
 * cannot be reached by keyboard). A toggle button with `aria-expanded`, not
 * `<details>`: StatNote sits inside `<p>` sentences, where only phrasing
 * content is valid. The detail is rendered on the server and only hidden, so
 * it is in the HTML for crawlers and the `aria-controls` target always exists.
 *
 * The button keeps the note's text size; `py-3.5 -my-3.5` (14 px each side of
 * the 16 px line) makes its hit area 44 px tall without moving the line it
 * sits on.
 */
export function StatNote({ text, detail }: { text: string; detail: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="text-xs text-subtle">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="-my-3.5 py-3.5 text-left underline decoration-dotted underline-offset-4 hover:text-foreground"
      >
        {text} <span className="tabular whitespace-nowrap">(i)</span>
      </button>
      <span
        id={id}
        hidden={!open}
        className="tabular mt-1 block max-w-prose border-2 border-border bg-surface-muted px-2.5 py-2 leading-relaxed break-words text-muted"
      >
        {detail}
      </span>
    </span>
  );
}
