import { useEffect, useMemo, useState } from "react";
import type { PetDetail } from "@pokepet/core";
import { ElementBadge, EvolutionTree, Sprite } from "@pokepet/ui";
import type { OwnedPet } from "../shared/store.ts";
import { useOpenLink } from "./Browse.tsx";
import { formatDuration, loadPet, padNumber, spriteUrl, type PackData } from "./data.ts";
import { GrowthBar, growthLabel } from "./Growth.tsx";
import { ReleaseDialog } from "./ReleaseDialog.tsx";

interface Props {
  data: PackData;
  pet: OwnedPet;
  isActive: boolean;
  onBack: () => void;
  onOpenSpecies: (slug: string) => void;
  onSetActive: (id: string | null) => void;
  onRelease: (id: string) => void;
}

/** One of your pets: how long it's been on screen and how close it is to evolving. */
export function OwnedPetPage({ data, pet, isActive, onBack, onOpenSpecies, onSetActive, onRelease }: Props) {
  const [detail, setDetail] = useState<PetDetail | null>(null);
  const [releasing, setReleasing] = useState(false);
  const Link = useOpenLink(onOpenSpecies);
  const elements = useMemo(() => new Map(data.pack.elements.map((e) => [e.id, e])), [data.pack.elements]);
  const summary = data.bySlug.get(pet.species);
  const name = summary?.name ?? pet.species;

  useEffect(() => {
    void loadPet(pet.species).then(setDetail);
  }, [pet.species]);

  // Stages in this line that exist in the pack, for "Stage 1 of 3".
  const stages = useMemo(() => {
    const line = Object.values(data.evolution).filter((e) => e.base === pet.line);
    return line.length ? Math.max(...line.map((e) => e.stage)) + 1 : 1;
  }, [data.evolution, pet.line]);
  const stage = (data.evolution[pet.species]?.stage ?? 0) + 1;

  return (
    <article className="flex flex-col gap-6">
      <button type="button" className="btn btn-ghost btn-sm self-start -ml-2" onClick={onBack}>
        ← Back to My Pets
      </button>

      <section className="panel p-6 sm:p-8 flex flex-col sm:flex-row gap-8 items-center sm:items-start">
        <div className="shrink-0 rounded-2xl bg-tile p-4">
          <Sprite key={pet.species} src={spriteUrl(pet.species)} atlas={data.pack.atlas} playing scale={1.1} label={`${name}, animated`} />
        </div>
        <div className="flex flex-col gap-3 min-w-0 flex-1">
          {isActive ? (
            <span className="pill pill-live self-start">On your screen</span>
          ) : (
            <span className="pill self-start bg-tile text-muted">Resting</span>
          )}
          <h1 className="font-display text-4xl font-bold">{name}</h1>
          <div className="flex gap-2">
            {(summary?.elements ?? []).map((e) => {
              const el = elements.get(e);
              return el ? <ElementBadge key={e} element={el} size="md" /> : null;
            })}
          </div>
          {detail && <p className="text-muted max-w-prose">{detail.blurb || detail.description}</p>}
          <div className="mt-1 flex flex-wrap gap-2">
            {isActive ? (
              <button type="button" className="btn" onClick={() => onSetActive(null)}>
                Put away
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => onSetActive(pet.id)}>
                Put on screen
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-danger" onClick={() => setReleasing(true)}>
              Release
            </button>
          </div>
        </div>
      </section>

      <section className="panel p-6 flex flex-col gap-5">
        <h2 className="font-display text-xl font-medium">Growth</h2>
        <GrowthBar pet={pet} data={data} onScreen={isActive} />
        {!isActive && (
          <p className="text-sm text-muted -mt-2">It only grows while it's on your screen.</p>
        )}
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-line">
          <Fact label="Time on screen" value={formatDuration(pet.onScreenMs)} />
          <Fact label="Stage" value={`${stage} of ${stages}`} />
          <Fact label="Adopted" value={new Date(pet.adoptedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} />
          <Fact label={data.pack.numberLabel} value={summary ? padNumber(summary.number) : "—"} />
        </dl>
      </section>

      {detail?.evolution && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-medium">Evolution line</h2>
          <div className="panel p-5">
            <EvolutionTree
              root={detail.evolution}
              current={pet.species}
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

      {releasing && (
        <ReleaseDialog
          pet={pet}
          name={name}
          onCancel={() => setReleasing(false)}
          onConfirm={() => {
            setReleasing(false);
            onRelease(pet.id);
          }}
        />
      )}
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
