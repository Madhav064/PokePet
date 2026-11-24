import { GROWTH_THRESHOLDS_MS, growthOf, type EvolutionNode } from "@pokepet/core";
import type { OwnedPet } from "../shared/store.ts";
import { formatDuration, type PackData } from "./data.ts";

const hours = (ms: number) => Math.round(ms / 3_600_000);

/** Label for the arrow into a stage on the evolution tree, e.g. "After 5 h on screen". */
export function growthLabel(data: PackData) {
  return (node: EvolutionNode) => {
    const stage = node.slug ? data.evolution[node.slug]?.stage : undefined;
    const at = stage ? GROWTH_THRESHOLDS_MS[stage - 1] : undefined;
    return at ? `After ${hours(at)} h on screen` : "Evolves";
  };
}

/**
 * Progress towards a pet's next evolution: a bar, what it becomes and how much
 * screen time is left. `compact` is the slim version used on cards.
 */
export function GrowthBar({ pet, data, onScreen, compact = false }: { pet: OwnedPet; data: PackData; onScreen: boolean; compact?: boolean }) {
  const growth = growthOf(pet.onScreenMs, data.evolution[pet.species]);
  const name = (slug: string) => data.bySlug.get(slug)?.name ?? slug;

  if (!growth.evolves) {
    const fully = (data.evolution[pet.species]?.stage ?? 0) > 0;
    return compact ? (
      <span className="text-xs text-muted">{fully ? "Fully evolved" : "Doesn't evolve"}</span>
    ) : (
      <div className="flex flex-col gap-1">
        <span className="font-semibold">{fully ? "Fully evolved" : "This pet doesn't evolve"}</span>
        <span className="text-sm text-muted">
          {fully ? `${name(pet.species)} has reached its final form.` : `${name(pet.species)} stays as it is, however long it's with you.`}
        </span>
      </div>
    );
  }

  const into = growth.next.length === 1 ? name(growth.next[0]!) : `one of ${growth.next.length} forms`;
  const pct = Math.round(growth.progress * 100);
  const bar = (
    <div
      className="growth-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={`Growth towards ${into}`}
    >
      <span style={{ width: `${pct}%` }} />
    </div>
  );

  if (compact) {
    return (
      <div className="flex flex-col gap-1 w-full">
        {bar}
        <span className="text-[11px] text-muted tabular-nums text-center">
          {growth.ready ? (onScreen ? "Evolving…" : "Ready to evolve") : `${formatDuration(growth.remainingMs)} to evolve`}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-semibold">
          {growth.ready && onScreen ? `Evolving into ${into}…` : growth.ready ? `Ready to evolve into ${into}` : `Evolves into ${into}`}
        </span>
        <span className="text-sm text-muted tabular-nums">{pct}%</span>
      </div>
      {bar}
      <span className="text-sm text-muted">
        {growth.ready
          ? onScreen
            ? "Keep it on screen. It's about to evolve!"
            : "Put it on your screen and it will evolve."
          : `${formatDuration(growth.remainingMs)} more on screen to go · evolves at ${hours(growth.atMs)} h in total`}
      </span>
    </div>
  );
}
