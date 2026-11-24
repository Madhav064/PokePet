import type { EvolutionNode, PetDetail } from "./pack.ts";

/** Where one pet sits in its evolution line, counting only stages that exist in the pack. */
export interface EvolutionInfo {
  slug: string;
  /** 0 for the first form in the pack, 1 for its evolution, and so on. */
  stage: number;
  /** First form of this line that exists in the pack. */
  base: string;
  /** Pets in the pack this one can evolve into. More than one means a branch (e.g. Eevee). */
  next: string[];
  /** Whether it can be adopted: only first forms, never alternate forms. */
  adoptable: boolean;
}

export type EvolutionIndex = Record<string, EvolutionInfo>;

/**
 * Builds the evolution index for a whole pack from its pet details.
 * Pure and UI-agnostic, so every app grows pets by the same rules.
 */
export function buildEvolutionIndex(details: PetDetail[]): EvolutionIndex {
  const inPack = new Set(details.map((d) => d.slug));
  const variants = new Set(details.filter((d) => d.isVariant).map((d) => d.slug));
  const index: EvolutionIndex = {};

  /** Nearest descendants of `node` that are in the pack (skipping stages the roster leaves out). */
  const nextInPack = (node: EvolutionNode): string[] =>
    node.children.flatMap((c) => (c.slug && inPack.has(c.slug) ? [c.slug] : nextInPack(c)));

  const visit = (node: EvolutionNode, base: string | null, stage: number) => {
    const here = node.slug && inPack.has(node.slug) ? node.slug : null;
    const lineBase = base ?? here;
    if (here && !index[here]) {
      index[here] = {
        slug: here,
        stage,
        base: lineBase!,
        next: nextInPack(node),
        adoptable: base === null && !variants.has(here),
      };
    }
    for (const c of node.children) visit(c, lineBase, here ? stage + 1 : stage);
  };

  for (const d of details) if (d.evolution) visit(d.evolution, null, 0);

  // Pets with no evolution data stand alone: adoptable, never evolve.
  for (const d of details) {
    index[d.slug] ??= { slug: d.slug, stage: 0, base: d.slug, next: [], adoptable: !d.isVariant };
  }
  return index;
}
