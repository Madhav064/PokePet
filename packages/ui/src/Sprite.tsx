"use client";
import { useEffect, useRef, useState } from "react";
import { getAnimation, type AtlasSpec } from "@pokepet/core";
import { createSpritePlayer, prefersReducedMotion, spriteStyle, type SpritePlayer } from "@pokepet/sprite-engine";

export interface SpriteProps {
  src: string;
  atlas: AtlasSpec;
  animation?: string;
  playing?: boolean;
  scale?: number;
  /** Defer loading the sheet until the sprite scrolls near the viewport. */
  lazy?: boolean;
  label: string;
  className?: string;
}

export function Sprite({ src, atlas, animation = "idle", playing = false, scale = 1, lazy = false, label, className }: SpriteProps) {
  const ref = useRef<HTMLDivElement>(null);
  const player = useRef<SpritePlayer | null>(null);
  const [visible, setVisible] = useState(!lazy);

  useEffect(() => {
    if (visible || !ref.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !ref.current) return;
    player.current = createSpritePlayer(ref.current, { atlas, src, animation, scale });
    return () => player.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, src, atlas]);

  useEffect(() => {
    const p = player.current;
    if (!p) return;
    p.setScale(scale);
    if (animation !== p.animation) p.setAnimation(animation);
    if (playing && !prefersReducedMotion()) p.play();
    else p.stop();
  }, [visible, animation, playing, scale]);

  const initial = spriteStyle(atlas, visible ? src : null, getAnimation(atlas, animation), 0, scale);
  return <div ref={ref} role="img" aria-label={label} className={className} style={initial} />;
}
