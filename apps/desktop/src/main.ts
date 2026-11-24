import { invoke, isTauri } from "@tauri-apps/api/core";
import type { PackManifest } from "@pokepet/core";
import { createSpritePlayer } from "@pokepet/sprite-engine";
import { Behaviour } from "./behaviour.ts";

const PACK = "pokemon";
const DEFAULT_PET = "bulbasaur";
/** Size of the pet relative to its 192×208 sprite cell. */
const SCALE = 0.5;
/** Part of the sprite cell that counts as "the pet" for the mouse (cells have some empty margin). */
const HIT_INSET = { left: 0.08, right: 0.08, top: 0.12, bottom: 0 };
/** How far (px) the mouse must move with the button down before a click becomes a drag. */
const DRAG_THRESHOLD = 4;

const native = isTauri();
const call = (cmd: string, args: Record<string, unknown>) => (native ? invoke(cmd, args) : Promise.resolve());

/** Keep receiving the mouse everywhere (while dragging or picking a spot), not just over the pet. */
const captureMouse = (on: boolean) => void call("set_capture", { on });

async function start() {
  const el = document.getElementById("pet")!;
  const hint = document.getElementById("hint")!;
  const pet = new URLSearchParams(location.search).get("pet") ?? localStorage.getItem("pet") ?? DEFAULT_PET;

  const manifest = (await fetch(`/packs/${PACK}/pack.json`).then((r) => r.json())) as PackManifest;
  const { atlas } = manifest;
  const petW = atlas.cellWidth * SCALE;
  const petH = atlas.cellHeight * SCALE;

  // The player animates and flips the inner element. The outer one is what we move,
  // so flipping happens in place instead of around the screen's left edge.
  const player = createSpritePlayer(document.getElementById("sprite")!, {
    atlas,
    src: `/packs/${PACK}/pets/${pet}/spritesheet.webp`,
    animation: "idle",
    scale: SCALE,
    autoplay: true,
  });
  const savedX = Number(localStorage.getItem("petX"));
  const brain = new Behaviour({
    atlas,
    petWidth: petW,
    petHeight: petH,
    stageWidth: innerWidth,
    stageHeight: innerHeight,
    startX: Number.isFinite(savedX) && localStorage.getItem("petX") !== null ? savedX : undefined,
  });
  addEventListener("resize", () => brain.resize(innerWidth, innerHeight));

  // ---- picking a spot (after a right click) ----------------------------------
  let ignoreNextContextMenu = false;
  document.addEventListener("pointerdown", () => (ignoreNextContextMenu = false));
  const startAwaiting = () => {
    brain.askWhereToGo();
    if (brain.currentMode !== "awaiting") return;
    document.body.classList.add("awaiting");
    captureMouse(true);
  };
  const stopAwaiting = () => {
    document.body.classList.remove("awaiting");
    captureMouse(false);
  };

  // Capture phase, so a click while picking a spot never also counts as a click on the pet.
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (brain.currentMode !== "awaiting") return;
      e.stopPropagation();
      e.preventDefault();
      if (e.button === 0) brain.goTo(e.clientX);
      else {
        brain.cancel();
        // The right click that cancels shouldn't immediately ask again.
        ignoreNextContextMenu = true;
      }
      stopAwaiting();
    },
    true,
  );
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && brain.currentMode === "awaiting") {
      brain.cancel();
      stopAwaiting();
    }
  });
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (ignoreNextContextMenu) ignoreNextContextMenu = false;
    else startAwaiting();
  });

  // ---- click to pet, hold and drag to carry ----------------------------------
  let press: { x: number; y: number } | null = null;
  let dragging = false;

  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    press = { x: e.clientX, y: e.clientY };
    dragging = false;
    el.setPointerCapture(e.pointerId);
    captureMouse(true);
  });
  el.addEventListener("pointermove", (e) => {
    if (!press) return;
    if (!dragging && Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_THRESHOLD) {
      dragging = true;
      brain.pickUp(press.x, press.y);
      document.body.classList.add("carrying");
    }
    if (dragging) brain.carry(e.clientX, e.clientY);
  });
  const release = () => {
    if (!press) return;
    if (dragging) brain.drop();
    else brain.poke();
    press = null;
    dragging = false;
    document.body.classList.remove("carrying");
    captureMouse(false);
  };
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
  el.addEventListener("lostpointercapture", release);

  // ---- tell the native side where the pet is, so only the pet catches the mouse ----
  let sent = { x: NaN, y: NaN, at: 0 };
  const sendHitbox = (x: number, y: number, now: number) => {
    if (!native) return;
    const moved = Math.abs(x - sent.x) >= 1 || Math.abs(y - sent.y) >= 1;
    if ((!moved && now - sent.at < 500) || now - sent.at < 30) return;
    sent = { x, y, at: now };
    void invoke("set_hitbox", {
      x: x + petW * HIT_INSET.left,
      y: y + petH * HIT_INSET.top,
      w: petW * (1 - HIT_INSET.left - HIT_INSET.right),
      h: petH * (1 - HIT_INSET.top - HIT_INSET.bottom),
    });
  };

  let last = performance.now();
  let savedAt = 0;
  const frame = (now: number) => {
    // Clamp dt so a sleeping laptop or hidden window doesn't teleport the pet.
    const dt = Math.min(now - last, 100);
    last = now;
    const f = brain.update(dt);
    if (player.animation !== f.animation) player.play(f.animation);
    el.style.transform = `translate3d(${Math.round(f.x)}px, ${Math.round(f.y)}px, 0)`;
    hint.style.transform = `translate3d(${Math.round(f.x + petW / 2)}px, ${Math.round(f.y)}px, 0)`;
    sendHitbox(f.x, f.y, now);
    if (now - savedAt > 2000 && (f.mode === "idle" || f.mode === "react")) {
      savedAt = now;
      localStorage.setItem("petX", String(Math.round(f.x)));
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void start();
