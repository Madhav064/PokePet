import { useCallback, useEffect, useState } from "react";
import { phone, type PhoneStatus } from "../shared/phone.ts";

/**
 * The phone's status, refreshed whenever the app comes back to the front (the user may
 * have just been in Android's wallpaper picker or settings).
 */
export function usePhoneStatus() {
  const [status, setStatus] = useState<PhoneStatus | null>(null);
  const refresh = useCallback(() => void phone.status().then(setStatus, () => {}), []);
  useEffect(() => {
    refresh();
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);
  return [status, setStatus] as const;
}

/** Whether the pet can be seen anywhere on the phone. */
export const petHasAHome = (s: PhoneStatus | null) => !s || s.wallpaperSet || s.overApps;

/**
 * Asked before PokePet becomes the wallpaper, so nobody is surprised when their own picture
 * disappears. Confirming opens Android's wallpaper preview, where they confirm once more.
 */
export function WallpaperDialog({ petName, onConfirm, onCancel }: {
  /** Set right after adopting, to say who needs the home. */
  petName?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onCancel}>
      <div className="panel dialog" role="alertdialog" aria-modal="true" aria-labelledby="wallpaper-title" aria-describedby="wallpaper-body"
        onClick={(e) => e.stopPropagation()}>
        <h2 id="wallpaper-title" className="font-display text-xl font-bold">
          {petName ? `Give ${petName} a home` : "Make your pet your wallpaper?"}
        </h2>
        <div id="wallpaper-body" className="flex flex-col gap-3 text-sm text-muted">
          <p>
            On your phone, {petName ?? "your pet"} lives on your wallpaper.{" "}
            <strong className="text-ink">PokePet will replace your current wallpaper</strong> with your pet walking on PokePet&apos;s
            dark backdrop.
          </p>
          <ul className="flex flex-col gap-1.5 list-disc pl-5">
            <li>If your phone asks where to use it, choose <strong className="text-ink">Lock screen</strong> to keep your home screen as it is.</li>
            <li>Want your own picture behind your pet? Choose a photo in the Phone tab.</li>
            <li>To go back, pick another wallpaper in your phone&apos;s settings at any time.</li>
          </ul>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <button type="button" className="btn" onClick={onCancel}>
            {petName ? "Later" : "Cancel"}
          </button>
          <button type="button" className="btn btn-primary" autoFocus onClick={onConfirm}>
            Set as wallpaper
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Asked once, right after PokePet becomes the wallpaper: picking the pet up needs
 * Android's "Display over other apps".
 */
export function PickUpDialog({ petName, onAllow, onCancel }: { petName: string; onAllow: () => void; onCancel: () => void }) {
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onCancel}>
      <div className="panel dialog" role="alertdialog" aria-modal="true" aria-labelledby="pickup-title" aria-describedby="pickup-body"
        onClick={(e) => e.stopPropagation()}>
        <h2 id="pickup-title" className="font-display text-xl font-bold">Pick up {petName}?</h2>
        <p id="pickup-body" className="text-sm text-muted">
          To grab {petName} on your home screen and drop it anywhere, PokePet needs to <strong className="text-ink">display over
          other apps</strong>. Your pet still stays off your apps unless you turn on Walk over my apps.
        </p>
        <div className="flex justify-end gap-2 mt-2">
          <button type="button" className="btn" onClick={onCancel}>
            Not now
          </button>
          <button type="button" className="btn btn-primary" autoFocus onClick={onAllow}>
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}

/** Shown on every screen until the pet has somewhere to live on the phone. */
export function WallpaperBanner({ onSet }: { onSet: () => void }) {
  return (
    <section className="panel p-5 mb-6 flex flex-col sm:flex-row sm:items-center gap-4 border-accent/40">
      <div className="flex flex-col gap-1 flex-1">
        <h2 className="font-display text-xl font-bold">Give your pet a home</h2>
        <p className="text-sm text-muted">
          Your pet lives on your wallpaper, so it's on your home screen and lock screen. This replaces your current wallpaper.
        </p>
      </div>
      <button type="button" className="btn btn-primary" onClick={onSet}>
        Set as wallpaper
      </button>
    </section>
  );
}

interface Props {
  status: PhoneStatus | null;
  /** Asks first, then makes PokePet the wallpaper (see WallpaperDialog). */
  onSetWallpaper: () => void;
  onChange: (s: PhoneStatus) => void;
  /** Shows a short message. */
  onToast: (message: string) => void;
}

/** The "Phone" tab: where the pet lives, what's behind it, and "Walk over my apps". */
export function PhoneSettings({ status, onSetWallpaper, onChange, onToast }: Props) {
  const [busy, setBusy] = useState(false);
  /** Runs a phone action, then shows `message(newStatus)` if there is one. */
  const act = async (action: () => Promise<PhoneStatus>, message?: (s: PhoneStatus) => string | undefined) => {
    setBusy(true);
    try {
      const s = await action();
      onChange(s);
      const m = message?.(s);
      if (m) onToast(m);
    } catch (e) {
      onToast(typeof e === "string" ? e : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!status) return <p className="text-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <h1 className="font-display text-3xl font-bold">On your phone</h1>

      <section className="panel p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-xl font-bold">Home screen &amp; lock screen</h2>
          <p className="text-sm text-muted">
            Your pet lives on your wallpaper, so it's there whenever you're on your home screen or lock screen, and out of
            the way when you open an app. Tap it to say hi, or tap an empty spot to call it over.
          </p>
        </div>
        {status.wallpaperSet ? (
          <span className="pill pill-live self-start">PokePet is your wallpaper</span>
        ) : (
          <div className="flex flex-col gap-2 items-start">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={onSetWallpaper}
            >
              Set as wallpaper
            </button>
            <p className="text-xs text-muted">
              This replaces your current wallpaper. Pick a photo below to put behind your pet.
            </p>
          </div>
        )}
        <p className="text-xs text-muted">
          Some phones keep their own lock screen picture. There, your pet shows on the home screen only.
        </p>
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <h3 className="font-semibold">Pick up your pet</h3>
          {status.canPickUp ? (
            <p className="text-sm text-muted">
              Drag your pet anywhere on your home screen and let go: it drops back down. Flick it to throw it.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted">
                To grab your pet on your home screen and drop it anywhere, allow PokePet to display over other apps.
              </p>
              <button type="button" className="btn self-start" disabled={busy} onClick={() => void act(phone.allowPickUp)}>
                Allow
              </button>
            </>
          )}
        </div>
      </section>

      <section className="panel p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-xl font-bold">Behind your pet</h2>
          <p className="text-sm text-muted">
            {status.hasBackground ? "Your own photo." : "PokePet's dark backdrop. Choose a photo of your own if you like."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" disabled={busy} onClick={() => void act(phone.pickBackground)}>
            {status.hasBackground ? "Choose another photo" : "Choose a photo"}
          </button>
          {status.hasBackground && (
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void act(phone.clearBackground)}>
              Use PokePet's backdrop
            </button>
          )}
        </div>
      </section>

      <section className="panel p-6 flex items-start gap-4">
        <div className="flex flex-col gap-1 flex-1">
          <h2 className="font-display text-xl font-bold">Walk over my apps</h2>
          <p className="text-sm text-muted">
            Your pet also walks on top of the apps you use, like on a computer. Drag it to move it, long-press it to open
            PokePet. Android will ask you to allow "Display over other apps", and shows a small notification while it's on.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={status.overApps}
          aria-label="Walk over my apps"
          className="switch mt-1"
          disabled={busy}
          onClick={() =>
            void act(
              () => phone.setOverApps(!status.overApps),
              (s) =>
                s.overApps === status.overApps
                  ? "PokePet wasn't allowed to show over other apps"
                  : s.overApps
                    ? "Your pet now walks over your apps"
                    : "Your pet stays on your home screen",
            )
          }
        />
      </section>
    </div>
  );
}
