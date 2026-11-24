import { useEffect, useMemo, useState } from "react";
import { GROWTH_THRESHOLDS_MS, type PetDetail } from "@pokepet/core";
import { ElementBadge, EvolutionTree, Sprite } from "@pokepet/ui";
import { ownedFromLine, type Collection } from "../shared/store.ts";
import { useOpenLink } from "./Browse.tsx";
import { loadPet, padNumber, spriteUrl, type PackData } from "./data.ts";
import { growthLabel } from "./Growth.tsx";

interface Props {
  data: PackData;
  slug: string;
  collection: Collection;
  onBack: () => void;
  onOpen: (slug: string) => void;
  onOpenOwned: (id: string) => void;
  onAdopt: (slug: string) => void;
}

export function PetPage({ data, slug, collection, onBack, onOpen, onOpenOwned, onAdopt }: Props) {
  const [pet, setPet] = useState<PetDetail | null>(null);
  const Link = useOpenLink(onOpen);
  const elements = useMemo(() => new Map(data.pack.elements.map((e) => [e.id, e])), [data.pack.elements]);
  const evo = data.evolution[slug];
  const base = evo && !evo.adoptable ? data.bySlug.get(evo.base) : undefined;
  // You can have one pet per evolution line: owning an Ivysaur means no second Bulbasaur.
  const owned = ownedFromLine(collection, evo?.base ?? slug);
  const ownedName = owned ? (data.bySlug.get(owned.species)?.name ?? owned.species) : "";

  useEffect(() => {
    void loadPet(slug).then(setPet);
  }, [slug]);

  if (!pet) return <p className="text-muted">Loading…</p>;

  return (
    <article className="flex flex-col gap-8">
      <button type="button" className="btn btn-ghost btn-sm self-start -ml-2" onClick={onBack}>
        ← Back to Browse
      </button>

      <section className="panel p-6 sm:p-8 flex flex-col sm:flex-row gap-8 items-center sm:items-start">
        <div className="shrink-0 rounded-2xl bg-tile p-4">
          <Sprite src={spriteUrl(slug)} atlas={data.pack.atlas} playing scale={1.1} label={`${pet.name}, animated`} />
        </div>
        <div className="flex flex-col gap-3 min-w-0">
          <span className="text-sm text-muted tabular-nums">
            {data.pack.numberLabel} {padNumber(pet.number)} · {pet.category}
          </span>
          <h1 className="font-display text-4xl font-bold">{pet.name}</h1>
          <div className="flex gap-2">
            {pet.elements.map((e) => {
              const el = elements.get(e);
              return el ? <ElementBadge key={e} element={el} size="md" /> : null;
            })}
          </div>
          <p className="text-muted max-w-prose">{pet.blurb || pet.description}</p>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            {owned ? (
              <>
                <button type="button" className="btn btn-primary" onClick={() => onOpenOwned(owned.id)}>
                  View your {ownedName}
                </button>
                <span className="text-sm text-muted">
                  {owned.species === slug
                    ? `${pet.name} is already in My Pets.`
                    : `You already have this evolution line: your ${ownedName}.`}
                </span>
              </>
            ) : evo?.adoptable ? (
              <>
                <button type="button" className="btn btn-primary" onClick={() => onAdopt(slug)}>
                  Adopt {pet.name}
                </button>
                <span className="text-sm text-muted">
                  {evo.next.length
                    ? `After ${Math.round(GROWTH_THRESHOLDS_MS[0] / 3_600_000)} h on your screen it grows into ${evo.next.length > 3 ? `one of ${evo.next.length} forms` : evo.next.map((s) => data.bySlug.get(s)?.name ?? s).join(" or ")}.`
                    : "This pet doesn't evolve."}
                </span>
              </>
            ) : base ? (
              <>
                <button type="button" className="btn" onClick={() => onOpen(base.slug)}>
                  View {base.name}
                </button>
                <span className="text-sm text-muted">
                  {pet.name} can't be adopted directly. Adopt {base.name} and it will grow into {pet.name}.
                </span>
              </>
            ) : (
              <span className="text-sm text-muted">This form can't be adopted.</span>
            )}
          </div>
        </div>
      </section>

      {pet.evolution && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-medium">Evolution</h2>
          <div className="panel p-5">
            <EvolutionTree
              root={pet.evolution}
              current={slug}
              atlas={data.pack.atlas}
              spriteUrl={spriteUrl}
              hrefFor={(s) => s}
              Link={Link}
              numberLabel={data.pack.numberLabel}
              conditionText={growthLabel(data)}
            />
          </div>
        </section>
      )}
    </article>
  );
}
