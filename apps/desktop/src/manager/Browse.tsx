import { useCallback, useMemo, useState } from "react";
import type { PetSummary } from "@pokepet/core";
import { DexBrowser, type LinkComponent } from "@pokepet/ui";
import type { Collection } from "../shared/store.ts";
import { spriteUrl, type PackData } from "./data.ts";

/** Shared UI renders "links"; in the app a link is a button that opens the pet inside the window. */
export function useOpenLink(onOpen: (slug: string) => void): LinkComponent {
  return useMemo<LinkComponent>(
    () =>
      function OpenPet({ href, className, children, ...rest }) {
        return (
          <button type="button" className={className} onClick={() => onOpen(href)} style={{ cursor: "pointer", font: "inherit" }} {...rest}>
            {children}
          </button>
        );
      },
    [onOpen],
  );
}

export function Browse({ data, collection, onOpen }: { data: PackData; collection: Collection; onOpen: (slug: string) => void }) {
  const [adoptableOnly, setAdoptableOnly] = useState(true);
  const Link = useOpenLink(onOpen);
  const adoptable = useCallback((p: PetSummary) => data.evolution[p.slug]?.adoptable ?? false, [data.evolution]);
  const ownedLines = useMemo(() => new Set(collection.pets.map((p) => p.line)), [collection.pets]);
  const badgeFor = useCallback(
    (p: PetSummary) => (ownedLines.has(data.evolution[p.slug]?.base ?? p.slug) ? <span className="pill pill-live">Adopted</span> : null),
    [ownedLines, data.evolution],
  );

  return (
    <div className="flex flex-col gap-2">
      <section className="mb-2 flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold">Find a pet</h1>
        <p className="text-muted max-w-xl">
          Adopt a pet and it moves onto your screen. The longer it stays there, the closer it gets to evolving.
        </p>
      </section>
      <DexBrowser
        pack={data.pack}
        pets={data.pets}
        spriteUrl={spriteUrl}
        hrefFor={(slug) => slug}
        Link={Link}
        filter={adoptableOnly ? adoptable : undefined}
        badgeFor={badgeFor}
        toolbarExtra={
          <button type="button" className="chip" aria-pressed={adoptableOnly} onClick={() => setAdoptableOnly((v) => !v)}>
            Can adopt
          </button>
        }
      />
    </div>
  );
}
