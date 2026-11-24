/** Copies each pack (manifest, data and spritesheets) into public/ so the desktop app ships with every pet offline. */
import { cp, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const packsDir = path.resolve(here, "../../../packs");
const outDir = path.resolve(here, "../public/packs");

await rm(outDir, { recursive: true, force: true });
for (const id of await readdir(packsDir)) {
  const src = path.join(packsDir, id);
  if (!(await stat(path.join(src, "pack.json")).catch(() => null))?.isFile()) continue;
  for (const part of ["pack.json", "data", "pets"]) {
    await cp(path.join(src, part), path.join(outDir, id, part), { recursive: true });
  }
  console.log(`synced pack "${id}"`);
}
