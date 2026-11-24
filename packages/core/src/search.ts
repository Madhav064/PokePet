import type { PetSummary } from "./pack.ts";

export type SortKey = "number" | "name";

export interface PetFilter {
  query?: string;
  groups?: number[];
  elements?: string[];
  includeVariants?: boolean;
  sort?: SortKey;
}

/** Pure, UI-agnostic filtering so web, desktop and mobile behave the same. */
export function filterPets(pets: PetSummary[], f: PetFilter): PetSummary[] {
  const q = (f.query ?? "").trim().toLowerCase().replace(/^#/, "");
  const num = /^\d+$/.test(q) ? Number(q) : null;
  const out = pets.filter((p) => {
    if (f.includeVariants === false && p.isVariant) return false;
    if (f.groups?.length && !f.groups.includes(p.group)) return false;
    if (f.elements?.length && !f.elements.every((e) => p.elements.includes(e))) return false;
    if (!q) return true;
    if (num !== null) return p.number === num;
    return p.name.toLowerCase().includes(q) || p.slug.includes(q);
  });
  const sort = f.sort ?? "number";
  return out.sort((a, b) =>
    sort === "name" ? a.name.localeCompare(b.name) : a.number - b.number || a.slug.localeCompare(b.slug),
  );
}
