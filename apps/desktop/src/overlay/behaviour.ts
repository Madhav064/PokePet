import { getAnimation, type AtlasSpec } from "@pokepet/core";

/**
 * The pet's "brain": a small state machine that decides what the pet does and
 * where it is. It knows nothing about the DOM or Tauri, so the same logic can
 * drive the desktop pet and, later, the mobile one.
 *
 * The pet never wanders off on its own. It stays where you leave it, idling and
 * doing the occasional trick in place, and only moves when you tell it to:
 * drag it somewhere (it falls back down when you let go) or send it to a spot.
 */
export type Mode =
  | "idle" // standing, with the odd trick in place
  | "react" // just got petted
  | "walk" // heading to a spot you picked
  | "awaiting" // you right-clicked it; waiting for you to pick a spot
  | "held" // you're carrying it
  | "fall" // you let go in mid-air
  | "land"; // just hit the ground

export interface PetFrame {
  /** Top-left of the pet, in px from the top-left of the stage. */
  x: number;
  y: number;
  animation: string;
  mode: Mode;
}

export interface BehaviourOptions {
  atlas: AtlasSpec;
  petWidth: number;
  petHeight: number;
  stageWidth: number;
  stageHeight: number;
  /** Where the pet starts; defaults to a random spot on the ground. */
  startX?: number;
  /** Walking speed in px per second. */
  speed?: number;
  random?: () => number;
}

const GRAVITY = 2600; // px/s²
const MAX_FALL_SPEED = 2200; // px/s
const IDLE_TRICKS = ["waving", "review", "jumping"] as const;
const REACTIONS = ["jumping", "waving"] as const;

export class Behaviour {
  private x: number;
  private y: number;
  private vy = 0;
  private mode: Mode = "idle";
  private animation = "idle";
  private timeLeft = 0;
  private targetX = 0;
  private stageWidth: number;
  private stageHeight: number;
  /** Where inside the pet the user grabbed it, so it doesn't jump to the cursor. */
  private grab = { dx: 0, dy: 0 };
  private readonly speed: number;
  private readonly rand: () => number;
  private readonly opts: BehaviourOptions;

  constructor(opts: BehaviourOptions) {
    this.opts = opts;
    this.rand = opts.random ?? Math.random;
    this.speed = opts.speed ?? 110;
    this.stageWidth = opts.stageWidth;
    this.stageHeight = opts.stageHeight;
    this.x = this.clampX(opts.startX ?? this.rand() * this.maxX);
    this.y = this.groundY;
    this.rest();
  }

  get currentMode() {
    return this.mode;
  }

  private get maxX() {
    return Math.max(0, this.stageWidth - this.opts.petWidth);
  }

  private get groundY() {
    return Math.max(0, this.stageHeight - this.opts.petHeight);
  }

  private clampX(x: number) {
    return Math.min(Math.max(0, x), this.maxX);
  }

  private between(lo: number, hi: number) {
    return lo + this.rand() * (hi - lo);
  }

  private pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.rand() * items.length)]!;
  }

  /** How long one full play of an animation takes, in ms. */
  private loopMs(animation: string) {
    const a = getAnimation(this.opts.atlas, animation);
    return a.frames * a.frameMs;
  }

  private enter(mode: Mode, animation: string, ms = Infinity) {
    this.mode = mode;
    this.animation = animation;
    this.timeLeft = ms;
  }

  /** Stand still for a while. Mostly idle, sometimes waiting, now and then a trick. */
  private rest() {
    const r = this.rand();
    if (r < 0.6) this.enter("idle", "idle", this.between(4000, 9000));
    else if (r < 0.85) this.enter("idle", "waiting", this.between(3000, 6000));
    else {
      const trick = this.pick(IDLE_TRICKS);
      this.enter("idle", trick, this.loopMs(trick) * 2);
    }
  }

  // ---- things the user does -------------------------------------------------

  /** A quick left click: the pet reacts happily. */
  poke() {
    if (this.mode === "held" || this.mode === "fall") return;
    const reaction = this.pick(REACTIONS);
    this.enter("react", reaction, this.loopMs(reaction) * 2);
  }

  /** Left button held down on the pet and moved: pick it up. (px, py) is the cursor. */
  pickUp(px: number, py: number) {
    this.grab = { dx: px - this.x, dy: py - this.y };
    this.vy = 0;
    this.enter("held", "running");
  }

  /** The cursor moved while carrying the pet. */
  carry(px: number, py: number) {
    if (this.mode !== "held") return;
    this.x = this.clampX(px - this.grab.dx);
    this.y = Math.min(Math.max(0, py - this.grab.dy), this.groundY);
  }

  /** Let go: the pet falls straight down to the ground. */
  drop() {
    if (this.mode !== "held") return;
    this.vy = 0;
    if (this.y >= this.groundY - 1) this.land();
    else this.enter("fall", "jumping");
  }

  /** Right click on the pet: it waits for you to show it where to go. */
  askWhereToGo() {
    if (this.mode === "held" || this.mode === "fall") return;
    this.enter("awaiting", "review");
  }

  /** You picked a spot (cursor x). The pet walks there along the ground and stays. */
  goTo(px: number) {
    if (this.mode !== "awaiting") return;
    this.targetX = this.clampX(px - this.opts.petWidth / 2);
    if (Math.abs(this.targetX - this.x) < 2) return this.rest();
    this.enter("walk", this.targetX > this.x ? "running-right" : "running-left");
  }

  /** Right click again or Escape while waiting for a spot. */
  cancel() {
    if (this.mode === "awaiting") this.rest();
  }

  private land() {
    this.y = this.groundY;
    this.vy = 0;
    this.enter("land", "jumping", this.loopMs("jumping"));
  }

  // ---- simulation -------------------------------------------------------------

  /** The screen or work area changed size. */
  resize(stageWidth: number, stageHeight: number) {
    this.stageWidth = stageWidth;
    this.stageHeight = stageHeight;
    this.x = this.clampX(this.x);
    this.targetX = this.clampX(this.targetX);
    if (this.mode !== "held" && this.mode !== "fall") this.y = this.groundY;
    else this.y = Math.min(this.y, this.groundY);
  }

  /** Advance the simulation by dt milliseconds. */
  update(dt: number): PetFrame {
    const s = dt / 1000;
    switch (this.mode) {
      case "walk": {
        const step = this.speed * s;
        const d = this.targetX - this.x;
        if (Math.abs(d) <= step) {
          this.x = this.targetX;
          this.enter("idle", "waving", this.loopMs("waving") * 2); // "here I am!"
        } else {
          this.x += Math.sign(d) * step;
        }
        break;
      }
      case "fall": {
        this.vy = Math.min(this.vy + GRAVITY * s, MAX_FALL_SPEED);
        this.y += this.vy * s;
        if (this.y >= this.groundY) this.land();
        break;
      }
      case "held":
      case "awaiting":
        break;
      default: {
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) this.rest();
      }
    }
    return { x: this.x, y: this.y, animation: this.animation, mode: this.mode };
  }
}
