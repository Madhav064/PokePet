/**
 * Copies each pack (manifest, data and spritesheets) into public/ so the desktop app
 * ships with every pet offline, and writes data/evolution.json: each pet's stage, what
 * it evolves into and whether it can be adopted.
 */
import { cp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEvolutionIndex, type PetDetail } from "@pokepet/core";

const here = path.dirname(fileURLToPath(import.meta.url));
const packsDir = path.resolve(here, "../../../packs");
const outDir = path.resolve(here, "../public/packs");

await rm(outDir, { recursive: true, force: true });
for (const id of await readdir(packsDir)) {
  const src = path.join(packsDir, id);
  if (!(await stat(path.join(src, "pack.json")).catch(() => null))?.isFile()) continue;
  const out = path.join(outDir, id);
  for (const part of ["pack.json", "data", "pets"]) {
    await cp(path.join(src, part), path.join(out, part), { recursive: true });
  }
  const petsDir = path.join(src, "data", "pets");
  const details = await Promise.all(
    (await readdir(petsDir)).map(async (f) => JSON.parse(await readFile(path.join(petsDir, f), "utf8")) as PetDetail),
  );
  await writeFile(path.join(out, "data", "evolution.json"), JSON.stringify(buildEvolutionIndex(details)));
  console.log(`synced pack "${id}" (${details.length} pets)`);
}
