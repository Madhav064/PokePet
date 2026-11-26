"use client";

/**
 * The pet a visitor tried to adopt before they had the app. Kept in this browser so that,
 * if the installer couldn't carry it over, the site can offer to finish adopting it.
 */
export interface PendingAdoption {
  slug: string;
  name: string;
  at: number;
}

const KEY = "pp-pending-adopt";
const KEEP_FOR_MS = 7 * 24 * 3_600_000;

export function savePending(slug: string, name: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ slug, name, at: Date.now() } satisfies PendingAdoption));
    window.dispatchEvent(new Event("pp-pending-change"));
  } catch {
    // Storage can be unavailable (private windows); the installer note still works.
  }
}

export function readPending(): PendingAdoption | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "null") as PendingAdoption | null;
    if (!p || Date.now() - p.at > KEEP_FOR_MS) return null;
    return p;
  } catch {
    return null;
  }
}

export function clearPending() {
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event("pp-pending-change"));
  } catch {
    // ignore
  }
}
