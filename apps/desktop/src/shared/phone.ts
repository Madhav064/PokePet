import { invoke, isTauri } from "@tauri-apps/api/core";

/**
 * The Android app's phone-only settings: the pet as the home/lock screen wallpaper,
 * the photo behind it, and "Walk over my apps". See src-tauri/src/phone.rs.
 *
 * In a desktop browser, add ?phone to manager.html to try these screens with a stand-in.
 */
export interface PhoneStatus {
  /** PokePet is the wallpaper, so the pet is on the home and lock screens. */
  wallpaperSet: boolean;
  /** "Walk over my apps" is on (and Android allows it). */
  overApps: boolean;
  /** The user picked their own photo for behind the pet. */
  hasBackground: boolean;
  /** PokePet may "Display over other apps", so the pet can be picked up on the home screen. */
  canPickUp: boolean;
}

interface Phone {
  status(): Promise<PhoneStatus>;
  /** Status bar and navigation bar sizes in CSS px (the app is drawn edge to edge). */
  insets(): Promise<{ top: number; bottom: number }>;
  /** Opens Android's wallpaper preview, where the user confirms. Resolves when they come back. */
  setWallpaper(): Promise<PhoneStatus>;
  /** Turning it on may first show Android's "Display over other apps" screen. */
  setOverApps(on: boolean): Promise<PhoneStatus>;
  /** Shows Android's "Display over other apps" screen, so the pet can be picked up. */
  allowPickUp(): Promise<PhoneStatus>;
  pickBackground(): Promise<PhoneStatus>;
  clearBackground(): Promise<PhoneStatus>;
}

const native = isTauri();
const fakePhone = !native && new URLSearchParams(location.search).has("phone");

/** Running as the Android app (or faking it in the browser). */
export const isPhone = (native && /Android/i.test(navigator.userAgent)) || fakePhone;

const nativePhone: Phone = {
  status: () => invoke<PhoneStatus>("phone_status"),
  insets: () => invoke<{ top: number; bottom: number }>("phone_insets"),
  setWallpaper: () => invoke<PhoneStatus>("phone_set_wallpaper"),
  setOverApps: (on) => invoke<PhoneStatus>("phone_set_over_apps", { on }),
  allowPickUp: () => invoke<PhoneStatus>("phone_allow_pick_up"),
  pickBackground: () => invoke<PhoneStatus>("phone_pick_background"),
  clearBackground: () => invoke<PhoneStatus>("phone_clear_background"),
};

function browserPhone(): Phone {
  const s: PhoneStatus = { wallpaperSet: false, overApps: false, hasBackground: false, canPickUp: false };
  const later = (change: Partial<PhoneStatus>) =>
    new Promise<PhoneStatus>((done) => setTimeout(() => done(Object.assign(s, change) && { ...s }), 400));
  return {
    status: async () => ({ ...s }),
    insets: async () => ({ top: 0, bottom: 0 }),
    setWallpaper: () => later({ wallpaperSet: true }),
    setOverApps: (on) => later({ overApps: on, canPickUp: s.canPickUp || on }),
    allowPickUp: () => later({ canPickUp: true }),
    pickBackground: () => later({ hasBackground: true }),
    clearBackground: () => later({ hasBackground: false }),
  };
}

export const phone: Phone = native ? nativePhone : browserPhone();

/** Keeps the page clear of the status bar and navigation bar (as --safe-top / --safe-bottom). */
export function applyInsets() {
  if (!isPhone) return;
  const apply = () =>
    void phone.insets().then(({ top, bottom }) => {
      document.documentElement.style.setProperty("--safe-top", `${top}px`);
      document.documentElement.style.setProperty("--safe-bottom", `${bottom}px`);
    }, () => {});
  apply();
  addEventListener("resize", apply);
}
