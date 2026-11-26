import type { EvolutionIndex, EvolutionInfo } from "./evolution.ts";

const HOUR = 3_600_000;

/**
 * Total time on screen a pet needs to reach each stage: stage 1 after 5 hours,
 * stage 2 after 15 hours in all. One place to tune how fast pets grow.
 */
export const GROWTH_THRESHOLDS_MS = [5 * HOUR, 15 * HOUR] as const;

export interface Growth {
  /** Whether this pet has an evolution ahead of it at all. */
  evolves: boolean;
  /** Pets it can turn into next (several for branching lines like Eevee). */
  next: string[];
  /** Total on-screen time at which this stage started and at which it evolves. */
  fromMs: number;
  atMs: number;
  /** 0–1 progress through the current stage. */
  progress: number;
  /** On-screen time still needed to evolve. */
  remainingMs: number;
  /** Enough time on screen: it should evolve now. */
  ready: boolean;
}

/** How far along a pet is, from its total on-screen time and its place in the evolution line. */
export function growthOf(onScreenMs: number, info: EvolutionInfo | undefined): Growth {
  const stage = info?.stage ?? 0;
  const next = info?.next ?? [];
  const atMs = GROWTH_THRESHOLDS_MS[stage];
  if (!next.length || atMs === undefined) {
    return { evolves: false, next: [], fromMs: 0, atMs: 0, progress: 1, remainingMs: 0, ready: false };
  }
  const fromMs = stage === 0 ? 0 : GROWTH_THRESHOLDS_MS[stage - 1]!;
  const progress = Math.min(1, Math.max(0, (onScreenMs - fromMs) / (atMs - fromMs)));
  return {
    evolves: true,
    next,
    fromMs,
    atMs,
    progress,
    remainingMs: Math.max(0, atMs - onScreenMs),
    ready: onScreenMs >= atMs,
  };
}

/** Label for the step into a pet on an evolution line, e.g. "After 5 h on screen". */
export function evolutionStepLabel(index: EvolutionIndex, slug: string | undefined): string {
  const stage = slug ? index[slug]?.stage : undefined;
  const at = stage ? GROWTH_THRESHOLDS_MS[stage - 1] : undefined;
  return at ? `After ${Math.round(at / HOUR)} h on screen` : "Evolves";
}

/** Picks what a pet evolves into. Branching lines (e.g. Eevee) are a surprise. */
export function pickEvolution(next: string[], random: () => number = Math.random): string | undefined {
  return next[Math.floor(random() * next.length)];
}
