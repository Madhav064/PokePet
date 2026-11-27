"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ElementDef } from "@pokepet/core";


/** "Type" dropdown: pick any number of types; the button shows what's picked. */
export function TypeFilter({ elements, selected, onChange }: {
  elements: ElementDef[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // Close on a click elsewhere or Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggleOpen = () => {
    // Open towards whichever side has room for the list.
    const r = button.current?.getBoundingClientRect();
    if (r) setAlignRight(r.left + 240 > window.innerWidth);
    setOpen((o) => !o);
  };
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const picked = elements.filter((e) => selected.includes(e.id));
  const [first] = picked;
  const label = !first ? "All types" : picked.length === 1 ? first.label : `${first.label} +${picked.length - 1}`;

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        className="chip"
        aria-haspopup="true"
        aria-expanded={open}
        aria-pressed={picked.length > 0}
        onClick={toggleOpen}
      >
        {first && picked.length === 1 && <span className="dot" aria-hidden="true" style={{ "--el": first.color } as CSSProperties} />}
        {label}
        <svg aria-hidden="true" viewBox="0 0 12 12" className={`size-3 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          role="group"
          aria-label="Type"
          className={`absolute top-full mt-2 z-30 w-56 max-h-[60vh] overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-[0_12px_32px_rgb(0_0_0/.35)] ${alignRight ? "right-0" : "left-0"}`}
        >
          <div className="grid grid-cols-2 gap-0.5">
            {elements.map((el) => {
              const on = selected.includes(el.id);
              return (
                <button
                  key={el.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(el.id)}
                  className={`flex items-center gap-2 h-8 px-2 rounded-lg text-left text-[.82rem] cursor-pointer ${on ? "bg-tile text-ink font-semibold" : "text-muted hover:bg-tile hover:text-ink"}`}
                >
                  <span className="size-2 rounded-full shrink-0" style={{ background: el.color }} aria-hidden="true" />
                  <span className="flex-1 truncate">{el.label}</span>
                  {on && (
                    <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3 shrink-0">
                      <path d="m2.5 6.5 2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
          {picked.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full h-8 rounded-lg text-[.82rem] text-muted hover:bg-tile hover:text-ink cursor-pointer border-t border-line"
            >
              Show all types
            </button>
          )}
        </div>
      )}
    </div>
  );
}
