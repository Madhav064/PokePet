/** Copies each pack's spritesheets into public/ so Next.js serves them. Runs before dev and build. */
import { cp, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const packsDir = path.resolve(here, "../../../packs");
const outDir = path.resolve(here, "../public/packs");

await rm(outDir, { recursive: true, force: true });
for (const id of await readdir(packsDir)) {
  const pets = path.join(packsDir, id, "pets");
  if (!(await stat(pets).catch(() => null))?.isDirectory()) continue;
  await cp(pets, path.join(outDir, id, "pets"), { recursive: true });
  console.log(`synced pack "${id}"`);
}
