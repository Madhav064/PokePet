"use client";
import { useEffect, useState } from "react";
import type { AtlasSpec } from "@pokepet/core";
import { Sprite } from "@pokepet/ui";
import { prefersReducedMotion } from "@pokepet/sprite-engine";

/** Large animated sprite with a picker for every animation row in the atlas. */
export function SpriteViewer({ atlas, src, name }: { atlas: AtlasSpec; src: string; name: string }) {
  const [anim, setAnim] = useState("idle");
  const [playing, setPlaying] = useState(false);
  useEffect(() => setPlaying(!prefersReducedMotion()), []);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-full rounded-2xl bg-tile flex items-center justify-center py-6 relative">
        <Sprite src={src} atlas={atlas} animation={anim} playing={playing} scale={1.25} label={`${name}, ${anim} animation`} />
        <button
          type="button"
          onClick={() => setPlaying(!playing)}
          className="absolute bottom-3 right-3 h-8 px-3 rounded-lg bg-surface border border-line text-xs font-medium text-muted hover:text-ink"
          aria-pressed={!playing}
        >
          {playing ? "Pause" : "Play"}
        </button>
      </div>
      <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Animation">
        {atlas.animations.map((a) => (
          <button
            key={a.id}
            type="button"
            className="chip"
            aria-pressed={anim === a.id}
            onClick={() => {
              setAnim(a.id);
              setPlaying(true);
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
