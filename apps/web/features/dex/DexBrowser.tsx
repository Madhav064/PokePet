"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { filterPets, type PackManifest, type PetSummary, type SortKey } from "@pokepet/core";
import { PetCard } from "@pokepet/ui";
import { AppLink } from "@/lib/AppLink";
import { routes, spriteUrl } from "@/lib/site";

interface State {
  q: string;
  groups: number[];
  elements: string[];
  sort: SortKey;
}
const EMPTY: State = { q: "", groups: [], elements: [], sort: "number" };

function readUrl(): State {
  const p = new URLSearchParams(window.location.search);
  return {
    q: p.get("q") ?? "",
    groups: (p.get("gen") ?? "").split(",").filter(Boolean).map(Number),
    elements: (p.get("type") ?? "").split(",").filter(Boolean),
    sort: p.get("sort") === "name" ? "name" : "number",
  };
}
function writeUrl(s: State) {
  const p = new URLSearchParams();
  if (s.q) p.set("q", s.q);
  if (s.groups.length) p.set("gen", s.groups.join(","));
  if (s.elements.length) p.set("type", s.elements.join(","));
  if (s.sort !== "number") p.set("sort", s.sort);
  const qs = p.toString();
  window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
}

const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

export function DexBrowser({ pack, pets }: { pack: PackManifest; pets: PetSummary[] }) {
  const [s, setS] = useState<State>(EMPTY);
  const [ready, setReady] = useState(false);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setS(readUrl());
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) writeUrl(s);
  }, [s, ready]);

  // "/" focuses search, Esc clears it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const elements = useMemo(() => new Map(pack.elements.map((e) => [e.id, e])), [pack.elements]);
  const groups = useMemo(() => [...new Set(pets.map((p) => p.group))].sort((a, b) => a - b), [pets]);
  const usedElements = useMemo(() => pack.elements.filter((e) => pets.some((p) => p.elements.includes(e.id))), [pack.elements, pets]);
  const results = useMemo(
    () => filterPets(pets, { query: s.q, groups: s.groups, elements: s.elements, sort: s.sort }),
    [pets, s],
  );
  const filtered = s.q || s.groups.length || s.elements.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="sticky top-14 z-20 -mx-4 px-4 py-3 bg-bg/95 backdrop-blur flex flex-col gap-3 border-b border-line sm:mx-0 sm:px-0">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative flex-1 min-w-[200px]">
            <span className="sr-only">Search pets</span>
            <input
              ref={search}
              id="dex-search"
              type="search"
              value={s.q}
              onChange={(e) => setS({ ...s, q: e.target.value })}
              onKeyDown={(e) => e.key === "Escape" && setS({ ...s, q: "" })}
              placeholder="Search by name or number"
              autoComplete="off"
              className="w-full h-10 rounded-xl border border-line bg-surface px-4 pr-10 text-sm outline-none focus:border-accent"
            />
            <span className="kbd absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline">/</span>
          </label>
          <div className="flex items-center gap-2" role="group" aria-label="Generation">
            {groups.map((g) => (
              <button key={g} type="button" className="chip" aria-pressed={s.groups.includes(g)} onClick={() => setS({ ...s, groups: toggle(s.groups, g) })}>
                Gen {g}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            Sort
            <select
              id="dex-sort"
              value={s.sort}
              onChange={(e) => setS({ ...s, sort: e.target.value as SortKey })}
              className="h-8 rounded-lg border border-line bg-surface px-2 text-ink"
            >
              <option value="number">Number</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 -mb-1" role="group" aria-label="Type">
          {usedElements.map((el) => (
            <button
              key={el.id}
              type="button"
              className="chip"
              aria-pressed={s.elements.includes(el.id)}
              style={{ "--el": el.color } as React.CSSProperties}
              onClick={() => setS({ ...s, elements: toggle(s.elements, el.id) })}
            >
              <span className="dot" aria-hidden="true" />
              {el.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-muted" aria-live="polite">
        <span>
          {results.length === pets.length ? `${pets.length} pets` : `${results.length} of ${pets.length} pets`}
        </span>
        {filtered ? (
          <button type="button" className="hover:text-ink underline underline-offset-4" onClick={() => setS(EMPTY)}>
            Clear filters
          </button>
        ) : null}
      </div>

      {results.length ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          {results.map((p) => (
            <li key={p.slug} className="min-w-0">
              <PetCard
                pet={p}
                atlas={pack.atlas}
                elements={elements}
                spriteUrl={spriteUrl(pack.id, p.slug)}
                href={routes.pet(p.slug)}
                Link={AppLink}
                numberLabel={pack.numberLabel}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="py-20 text-center text-muted">
          <p className="mb-3">No pets match these filters.</p>
          <button type="button" className="chip" onClick={() => setS(EMPTY)}>Clear filters</button>
        </div>
      )}
    </div>
  );
}
