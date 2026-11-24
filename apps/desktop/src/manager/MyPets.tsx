import { useMemo, useState } from "react";
import { ElementBadge, Sprite } from "@pokepet/ui";
import { activePet, type Collection, type OwnedPet } from "../shared/store.ts";
import { formatDuration, spriteUrl, type PackData } from "./data.ts";
import { GrowthBar } from "./Growth.tsx";
import { ReleaseDialog } from "./ReleaseDialog.tsx";

interface Props {
  data: PackData;
  collection: Collection;
  onBrowse: () => void;
  onOpenOwned: (id: string) => void;
  onSetActive: (id: string | null, name: string) => void;
  onRelease: (id: string, name: string) => void;
}

export function MyPets({ data, collection, onBrowse, onOpenOwned, onSetActive, onRelease }: Props) {
  const [releasing, setReleasing] = useState<OwnedPet | null>(null);
  const elements = useMemo(() => new Map(data.pack.elements.map((e) => [e.id, e])), [data.pack.elements]);
  const nameOf = (p: OwnedPet) => data.bySlug.get(p.species)?.name ?? p.species;
  const active = activePet(collection);
  // The pet on screen first, then most recently adopted.
  const pets = [...collection.pets].sort(
    (a, b) => Number(b.id === collection.active) - Number(a.id === collection.active) || b.adoptedAt - a.adoptedAt,
  );

  if (pets.length === 0) {
    return (
      <div className="panel p-10 flex flex-col items-center gap-3 text-center">
        <h1 className="font-display text-2xl font-bold">No pets yet</h1>
        <p className="text-muted max-w-sm">Adopt your first pet and it will move onto your screen right away.</p>
        <button type="button" className="btn btn-primary mt-2" onClick={onBrowse}>
          Find a pet
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {active ? (
        <section className="panel p-6 flex flex-col sm:flex-row items-center gap-6">
          <button type="button" className="shrink-0 rounded-2xl bg-tile p-3 cursor-pointer" onClick={() => onOpenOwned(active.id)} aria-label={`Open ${nameOf(active)}`}>
            <Sprite key={active.species} src={spriteUrl(active.species)} atlas={data.pack.atlas} playing scale={0.9} label={`${nameOf(active)}, animated`} />
          </button>
          <div className="flex flex-col gap-3 min-w-0 flex-1 self-stretch justify-center">
            <div className="flex flex-col gap-2">
              <span className="pill pill-live self-start">On your screen</span>
              <h1 className="font-display text-3xl font-bold">{nameOf(active)}</h1>
              <div className="flex items-center gap-3">
                <div className="flex gap-2">
                  {(data.bySlug.get(active.species)?.elements ?? []).map((e) => {
                    const el = elements.get(e);
                    return el ? <ElementBadge key={e} element={el} size="sm" /> : null;
                  })}
                </div>
                <span className="text-sm text-muted tabular-nums">{formatDuration(active.onScreenMs)} on screen</span>
              </div>
            </div>
            <div className="max-w-lg">
              <GrowthBar pet={active} data={data} onScreen />
            </div>
          </div>
          <div className="flex flex-col gap-2 self-stretch sm:self-center">
            <button type="button" className="btn" onClick={() => onOpenOwned(active.id)}>
              View details
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => onSetActive(null, nameOf(active))}>
              Put away
            </button>
          </div>
        </section>
      ) : (
        <section className="panel p-6">
          <p className="text-muted">No pet is on your screen right now. Pick one below to put it back.</p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl font-medium">All your pets</h2>
          <span className="text-sm text-muted">{pets.length === 1 ? "1 pet" : `${pets.length} pets`}</span>
        </div>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
          {pets.map((p) => (
            <OwnedCard
              key={p.id}
              pet={p}
              name={nameOf(p)}
              data={data}
              isActive={p.id === collection.active}
              onOpen={() => onOpenOwned(p.id)}
              onSetActive={() => onSetActive(p.id, nameOf(p))}
              onRelease={() => setReleasing(p)}
            />
          ))}
        </ul>
      </section>

      {releasing && (
        <ReleaseDialog
          pet={releasing}
          name={nameOf(releasing)}
          onCancel={() => setReleasing(null)}
          onConfirm={() => {
            onRelease(releasing.id, nameOf(releasing));
            setReleasing(null);
          }}
        />
      )}
    </div>
  );
}

function OwnedCard({ pet, name, data, isActive, onOpen, onSetActive, onRelease }: {
  pet: OwnedPet;
  name: string;
  data: PackData;
  isActive: boolean;
  onOpen: () => void;
  onSetActive: () => void;
  onRelease: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <li className={`owned-card ${isActive ? "is-active" : ""}`} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button type="button" className="owned-card-open" onClick={onOpen} aria-label={`Open ${name}`}>
        <Sprite key={pet.species} src={spriteUrl(pet.species)} atlas={data.pack.atlas} playing={hover || isActive} scale={0.6} lazy label={name} />
        <span className="font-semibold text-sm truncate max-w-full">{name}</span>
        <span className="text-xs text-muted tabular-nums">{formatDuration(pet.onScreenMs)} on screen</span>
      </button>
      <div className="w-full px-1">
        <GrowthBar pet={pet} data={data} onScreen={isActive} compact />
      </div>
      <div className="mt-1 flex items-center gap-1">
        {isActive ? (
          <span className="pill pill-live">On screen</span>
        ) : (
          <button type="button" className="btn btn-sm" onClick={onSetActive}>
            Put on screen
          </button>
        )}
        <button type="button" className="btn btn-sm btn-ghost" onClick={onRelease} aria-label={`Release ${name}`} title="Release">
          ✕
        </button>
      </div>
    </li>
  );
}
