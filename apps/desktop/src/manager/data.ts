import { useEffect, useState } from "react";
import type { EvolutionIndex, PackManifest, PetDetail, PetSummary } from "@pokepet/core";
import { store, type Collection } from "../shared/store.ts";

/** The app ships every pack offline in public/packs (see scripts/sync-packs.ts). */
export const PACK = "pokemon";
const base = `/packs/${PACK}`;
const json = <T,>(path: string) => fetch(`${base}/${path}`).then((r) => r.json() as Promise<T>);

export const spriteUrl = (slug: string) => `${base}/pets/${slug}/spritesheet.webp`;

export interface PackData {
  pack: PackManifest;
  pets: PetSummary[];
  bySlug: Map<string, PetSummary>;
  evolution: EvolutionIndex;
}

export async function loadPack(): Promise<PackData> {
  const [pack, pets, evolution] = await Promise.all([
    json<PackManifest>("pack.json"),
    json<PetSummary[]>("data/index.json"),
    json<EvolutionIndex>("data/evolution.json"),
  ]);
  return { pack, pets, bySlug: new Map(pets.map((p) => [p.slug, p])), evolution };
}

const details = new Map<string, Promise<PetDetail>>();
export const loadPet = (slug: string) => {
  if (!details.has(slug)) details.set(slug, json<PetDetail>(`data/pets/${slug}.json`));
  return details.get(slug)!;
};

/** Live view of the user's collection; re-renders on every change (including the on-screen clock). */
export function useCollection(): Collection | null {
  const [c, setC] = useState<Collection | null>(null);
  useEffect(() => {
    let alive = true;
    void store.get().then((v) => alive && setC(v));
    const off = store.subscribe(setC);
    return () => {
      alive = false;
      off();
    };
  }, []);
  return c;
}

/** "2 h 14 m", "45 m", "under a minute". */
export function formatDuration(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "under a minute";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} m`;
  return m ? `${h} h ${m} m` : `${h} h`;
}

export const padNumber = (n: number) => String(n).padStart(3, "0");
