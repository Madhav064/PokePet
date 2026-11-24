import type { AtlasSpec } from "./atlas.ts";

/**
 * A pack is a self-contained set of pets that share one atlas layout.
 * The engine and UI only ever see these types, never a specific franchise,
 * so an original-character pack can replace the first one without code changes.
 */
export interface PackManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  /** Shown wherever the pack's art appears. */
  attribution: string;
  license: string;
  atlas: AtlasSpec;
  /** Label for the creature number, e.g. "No.". */
  numberLabel: string;
  /** Stat names in display order with their max for bar scaling. */
  statSchema: StatDef[];
  /** Element/type styling used by badges. */
  elements: ElementDef[];
  counts: { pets: number };
}

export interface StatDef {
  id: string;
  label: string;
  short: string;
  max: number;
}

export interface ElementDef {
  id: string;
  label: string;
  /** Hex color for the badge background. */
  color: string;
}

/** Lightweight record used by lists, search and filters. */
export interface PetSummary {
  slug: string;
  name: string;
  number: number;
  /** Grouping such as generation or region. */
  group: number;
  elements: string[];
  /** Variant of another pet (alternate form). */
  isVariant: boolean;
  /** Slug of the base pet when isVariant. */
  baseSlug?: string;
  tags: string[];
  /** Relative path inside the pack to the atlas image. */
  spritesheet: string;
}

export interface Ability {
  id: string;
  name: string;
  hidden: boolean;
  effect: string;
}

export interface Fact {
  id: string;
  label: string;
  value: string;
}

export interface EvolutionNode {
  /** Species key; equals a pet slug when the pet exists in the pack. */
  key: string;
  name: string;
  number: number;
  /** Pet slug when this stage is in the pack. */
  slug?: string;
  /** How this stage is reached from its parent. Empty for the first stage. */
  conditions: string[];
  children: EvolutionNode[];
}

export interface ElementMatchup {
  /** Multiplier → element ids, e.g. { "4": ["ice"], "0.5": [...] } */
  [multiplier: string]: string[];
}

export interface PetDetail extends PetSummary {
  category: string;
  description: string;
  /** Short blurb shipped with the sprite. */
  blurb: string;
  heightM: number;
  weightKg: number;
  stats: Record<string, number>;
  abilities: Ability[];
  facts: Fact[];
  defenses: ElementMatchup;
  evolution: EvolutionNode | null;
  /** Other pets in the pack that are forms of the same creature. */
  variants: string[];
  flags: { legendary: boolean; mythical: boolean; baby: boolean };
}
