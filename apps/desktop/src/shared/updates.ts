import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { isPhone, phone } from "./phone.ts";

/**
 * Checks GitHub for a newer PokePet and installs it. The release workflow
 * (.github/workflows/release.yml) publishes every version there.
 *
 * - Windows: Tauri's updater reads latest.json from the newest release, checks the
 *   installer's signature, installs it and restarts PokePet.
 * - Android: there's no Play Store to do it, so we compare with the newest release's
 *   version, download its PokePet.apk and open Android's install screen.
 */
const REPO = "Madhav064/PokePet";
const CHECK_EVERY_MS = 6 * 3_600_000;

export interface AvailableUpdate {
  version: string;
  install(): Promise<void>;
}

/** "0.10.0" > "0.9.2", ignoring a leading "v". */
export function isNewer(latest: string, current: string): boolean {
  const parts = (v: string) => v.replace(/^v/, "").split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const a = parts(latest);
  const b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d > 0;
  }
  return false;
}

async function checkWindows(): Promise<AvailableUpdate | null> {
  const [{ check }, { relaunch }] = await Promise.all([import("@tauri-apps/plugin-updater"), import("@tauri-apps/plugin-process")]);
  const update = await check();
  if (!update) return null;
  return {
    version: update.version,
    install: async () => {
      // Windows closes PokePet while the installer runs; it opens again when done.
      await update.downloadAndInstall();
      await relaunch();
    },
  };
}

async function checkAndroid(): Promise<AvailableUpdate | null> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return null;
  const release = (await res.json()) as { tag_name: string; assets: { name: string }[] };
  // A release whose Android build failed (or hasn't finished) has no APK yet: nothing to offer.
  if (!release.assets.some((a) => a.name === "PokePet.apk")) return null;
  if (!isNewer(release.tag_name, await getVersion())) return null;
  const url = `https://github.com/${REPO}/releases/download/${release.tag_name}/PokePet.apk`;
  return { version: release.tag_name.replace(/^v/, ""), install: () => phone.installUpdate(url) };
}

/** A newer PokePet, if there is one. Checks on start and every few hours after. */
export function useUpdate(): AvailableUpdate | null {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  useEffect(() => {
    if (!isTauri()) return; // the UI running in a plain browser during development
    let stopped = false;
    const run = () =>
      void (isPhone ? checkAndroid() : checkWindows()).then(
        (u) => !stopped && u && setUpdate(u),
        () => {}, // offline, or GitHub unreachable: try again later
      );
    run();
    const timer = setInterval(run, CHECK_EVERY_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);
  return update;
}
