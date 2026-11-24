import { frameRect, getAnimation, type AnimationSpec, type AtlasSpec } from "@pokepet/core";

/**
 * Framework-agnostic spritesheet player.
 * Renders by moving the background of a plain element, so it works the same
 * in a web page, a Tauri desktop window or a webview on mobile.
 */

export interface SpriteStyle {
  width: string;
  height: string;
  backgroundImage?: string;
  backgroundSize: string;
  backgroundPosition: string;
  backgroundRepeat: "no-repeat";
  imageRendering: "pixelated";
  /**
   * Horizontal flip for mirrored animations, as the standalone `scale` property.
   * It flips around the element's own box, so move a wrapper element around, not the
   * sprite element itself: a translated sprite would be flipped off to the other side.
   */
  scale: string;
}

/** Pure: the CSS for one frame. Safe to call on the server for the first paint. */
export function spriteStyle(
  atlas: AtlasSpec,
  src: string | null,
  anim: AnimationSpec,
  frame: number,
  scale: number,
): SpriteStyle {
  const r = frameRect(atlas, anim, frame);
  return {
    width: `${atlas.cellWidth * scale}px`,
    height: `${atlas.cellHeight * scale}px`,
    ...(src ? { backgroundImage: `url("${src}")` } : {}),
    backgroundSize: `${atlas.width * scale}px ${atlas.height * scale}px`,
    backgroundPosition: `${-r.x * scale}px ${-r.y * scale}px`,
    backgroundRepeat: "no-repeat",
    imageRendering: "pixelated",
    scale: anim.mirror ? "-1 1" : "1 1",
  };
}

export interface PlayerOptions {
  atlas: AtlasSpec;
  src: string;
  animation?: string;
  scale?: number;
  autoplay?: boolean;
  /** Called when a play-once animation finishes. */
  onComplete?: (animation: string) => void;
}

export interface SpritePlayer {
  play(animation?: string): void;
  pause(): void;
  /** Pause and show the first frame. */
  stop(): void;
  setAnimation(animation: string): void;
  setScale(scale: number): void;
  readonly animation: string;
  readonly playing: boolean;
  destroy(): void;
}

export function createSpritePlayer(el: HTMLElement, opts: PlayerOptions): SpritePlayer {
  let anim = getAnimation(opts.atlas, opts.animation ?? "idle");
  let scale = opts.scale ?? 1;
  let frame = 0;
  let playing = false;
  let raf = 0;
  let last = 0;
  let acc = 0;

  const paint = () => {
    const s = spriteStyle(opts.atlas, null, anim, frame, scale);
    el.style.width = s.width;
    el.style.height = s.height;
    el.style.backgroundSize = s.backgroundSize;
    el.style.backgroundPosition = s.backgroundPosition;
    el.style.scale = s.scale;
  };
  el.style.backgroundImage = `url("${opts.src}")`;
  el.style.backgroundRepeat = "no-repeat";
  el.style.imageRendering = "pixelated";
  paint();

  const tick = (t: number) => {
    if (!playing) return;
    if (last) acc += t - last;
    last = t;
    while (acc >= anim.frameMs) {
      acc -= anim.frameMs;
      if (anim.once && frame === anim.frames - 1) {
        playing = false;
        opts.onComplete?.(anim.id);
        return;
      }
      frame = (frame + 1) % anim.frames;
      paint();
    }
    raf = requestAnimationFrame(tick);
  };

  const api: SpritePlayer = {
    play(animation) {
      if (animation && animation !== anim.id) api.setAnimation(animation);
      if (playing) return;
      playing = true;
      last = 0;
      acc = 0;
      raf = requestAnimationFrame(tick);
    },
    pause() {
      playing = false;
      cancelAnimationFrame(raf);
    },
    stop() {
      api.pause();
      frame = 0;
      paint();
    },
    setAnimation(animation) {
      anim = getAnimation(opts.atlas, animation);
      frame = 0;
      acc = 0;
      paint();
    },
    setScale(s) {
      scale = s;
      paint();
    },
    get animation() {
      return anim.id;
    },
    get playing() {
      return playing;
    },
    destroy() {
      api.pause();
    },
  };
  if (opts.autoplay) api.play();
  return api;
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
