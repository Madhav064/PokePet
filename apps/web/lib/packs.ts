import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { buildEvolutionIndex, type EvolutionIndex, type PackManifest, type PetDetail, type PetSummary } from "@pokepet/core";

/**
 * Pack loader. Reads the committed pack files at build time.
 * Swap this module's internals (e.g. to a database or CDN) without touching pages.
 */
const PACKS_DIR = path.join(process.cwd(), "../../packs");

const readJson = async <T,>(...parts: string[]): Promise<T> =>
  JSON.parse(await readFile(path.join(PACKS_DIR, ...parts), "utf8")) as T;

export const getManifest = cache((packId: string) => readJson<PackManifest>(packId, "pack.json"));
export const listPets = cache((packId: string) => readJson<PetSummary[]>(packId, "data", "index.json"));
/** Each pet's stage, next forms and whether it can be adopted (same rules as the app). */
export const getEvolutionIndex = cache(async (packId: string): Promise<EvolutionIndex> => {
  const pets = await listPets(packId);
  const details = await Promise.all(pets.map((p) => readJson<PetDetail>(packId, "data", "pets", `${p.slug}.json`)));
  return buildEvolutionIndex(details);
});

export const getPet = cache(async (packId: string, slug: string): Promise<PetDetail | null> => {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  try {
    return await readJson<PetDetail>(packId, "data", "pets", `${slug}.json`);
  } catch {
    return null;
  }
});
