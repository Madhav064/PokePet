/**
 * Atlas = one spritesheet image laid out as a grid of equal cells.
 * Each animation is one row; frames run left to right.
 */
export interface AnimationSpec {
  /** Stable id, e.g. "idle", "running-right". */
  id: string;
  /** Human label for UI. */
  label: string;
  row: number;
  frames: number;
  /** Duration of each frame in ms. */
  frameMs: number;
  /** Play once and hold the last frame instead of looping. */
  once?: boolean;
  /** Draw the row flipped horizontally, e.g. to get a right-facing walk from a left-facing row. */
  mirror?: boolean;
}

export interface AtlasSpec {
  width: number;
  height: number;
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  animations: AnimationSpec[];
}

/** The 8×9 Codex-compatible atlas used by the first pack. */
export const CODEX_ATLAS: AtlasSpec = {
  width: 1536,
  height: 1872,
  columns: 8,
  rows: 9,
  cellWidth: 192,
  cellHeight: 208,
  animations: [
    { id: "idle", label: "Idle", row: 0, frames: 6, frameMs: 180 },
    // Row 1 faces left in every source sheet. Row 2 is meant to face right, but in the
    // codex-pokepets sheets it is either a left-facing copy or swapped with row 1, so
    // both directions are drawn from row 1 and the right-facing walk is mirrored.
    { id: "running-right", label: "Run right", row: 1, frames: 8, frameMs: 90, mirror: true },
    { id: "running-left", label: "Run left", row: 1, frames: 8, frameMs: 90 },
    { id: "waving", label: "Wave", row: 3, frames: 4, frameMs: 160 },
    { id: "jumping", label: "Jump", row: 4, frames: 5, frameMs: 120 },
    { id: "failed", label: "Sad", row: 5, frames: 8, frameMs: 140 },
    { id: "waiting", label: "Wait", row: 6, frames: 6, frameMs: 200 },
    { id: "running", label: "Run", row: 7, frames: 6, frameMs: 100 },
    { id: "review", label: "Think", row: 8, frames: 6, frameMs: 180 },
  ],
};

export function getAnimation(atlas: AtlasSpec, id: string): AnimationSpec {
  return atlas.animations.find((a) => a.id === id) ?? atlas.animations[0]!;
}

/** Pixel rectangle of one frame inside the atlas. */
export function frameRect(atlas: AtlasSpec, anim: AnimationSpec, frame: number) {
  const f = ((frame % anim.frames) + anim.frames) % anim.frames;
  return {
    x: f * atlas.cellWidth,
    y: anim.row * atlas.cellHeight,
    w: atlas.cellWidth,
    h: atlas.cellHeight,
  };
}
