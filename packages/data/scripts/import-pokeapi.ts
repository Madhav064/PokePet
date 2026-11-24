/**
 * Builds the "pokemon" pack from:
 *   - packs/pokemon/roster.json         which pets to include (slugs)
 *   - a codex-pokepets checkout          spritesheets + short blurbs
 *   - PokeAPI's static data on GitHub    species, stats, abilities, evolutions
 *
 * Usage:
 *   node packages/data/scripts/import-pokeapi.ts [--source ../Pokemon-Pets]
 *
 * Output (committed): packs/pokemon/{pack.json, data/index.json, data/pets/*.json, pets/<slug>/spritesheet.webp}
 * Responses are cached in .cache/pokeapi so reruns are offline and fast.
 */
import { mkdir, readFile, writeFile, copyFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CODEX_ATLAS } from "../../core/src/atlas.ts";
import type {
  Ability,
  EvolutionNode,
  Fact,
  PackManifest,
  PetDetail,
  PetSummary,
} from "../../core/src/pack.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PACK_DIR = path.join(ROOT, "packs/pokemon");
const CACHE_DIR = path.join(ROOT, ".cache/pokeapi");
const API = process.env.POKEAPI_DATA_URL ?? "https://raw.githubusercontent.com/PokeAPI/api-data/master/data";

const argSource = process.argv.indexOf("--source");
const SOURCE = path.resolve(
  argSource > -1 ? process.argv[argSource + 1]! : process.env.POKEPET_SOURCE ?? path.join(ROOT, "../Pokemon-Pets"),
);

// ---------- fetch with cache ----------
type Json = any; // PokeAPI payloads are large and loosely shaped

async function api(urlOrPath: string): Promise<Json> {
  const p = urlOrPath.replace(/^https:\/\/pokeapi\.co/, "").replace(/\/?$/, "/");
  const file = path.join(CACHE_DIR, p.replace(/^\/|\/$/g, "").replaceAll("/", "_") + ".json");
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {}
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${API}${p}index.json`);
      if (!res.ok) throw new Error(`${res.status} ${p}`);
      const data = await res.json();
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(file, JSON.stringify(data));
      return data;
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
}

async function mapLimit<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]!);
      }
    }),
  );
  return out;
}

// ---------- helpers ----------
const en = (arr: Json[] | undefined, key = "name"): string | undefined =>
  arr?.find((x) => x.language?.name === "en")?.[key];

const titleCase = (s: string) =>
  s
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const idFromUrl = (u: string) => Number(u.match(/\/(\d+)\/?$/)![1]);

const clean = (s: string) => s.replace(/[\f\n\r­]+/g, " ").replace(/\s+/g, " ").replace(/POKéMON/g, "Pokémon").trim();

const FLAVOR_VERSIONS = [
  "scarlet", "violet", "sword", "shield", "ultra-sun", "ultra-moon", "sun", "moon",
  "omega-ruby", "alpha-sapphire", "x", "y", "black-2", "white-2", "black", "white",
  "heartgold", "soulsilver", "platinum", "diamond", "pearl", "emerald", "firered", "leafgreen",
];

function pickFlavor(species: Json): string {
  const entries = (species.flavor_text_entries as Json[]).filter((e) => e.language.name === "en");
  for (const v of FLAVOR_VERSIONS) {
    const hit = entries.find((e) => e.version.name === v);
    if (hit) return clean(hit.flavor_text);
  }
  return entries[0] ? clean(entries[0].flavor_text) : "";
}

const STAT_IDS: Record<string, string> = {
  hp: "hp", attack: "atk", defense: "def", "special-attack": "spa", "special-defense": "spd", speed: "spe",
};

const ELEMENTS = [
  ["normal", "#9a9a7d"], ["fire", "#e8643c"], ["water", "#4f8fe0"], ["electric", "#e8c22e"],
  ["grass", "#5fae4a"], ["ice", "#6cc8c8"], ["fighting", "#bf3a30"], ["poison", "#9b4fa3"],
  ["ground", "#cfa752"], ["flying", "#8f9ee6"], ["psychic", "#e85486"], ["bug", "#9aaa22"],
  ["rock", "#b39c3e"], ["ghost", "#6b5a96"], ["dragon", "#6a46e8"], ["dark", "#6b5848"],
  ["steel", "#9c9cb6"], ["fairy", "#e08fb0"],
] as const;

/** One readable line per distinct method; location-only methods collapse into one line. */
function evoConditions(details: Json[]): string[] {
  let lines = [...new Set(rawEvoConditions(details))].map((l) =>
    l.replace("Kings Rock", "King's Rock").replace(/^Use Move$/, "Special move condition"),
  );
  // Drop side-game alternatives (Legends: Arceus items, Galarian forms) when a main method exists.
  const sideGame = (l: string) =>
    /Galarica|Linking Cord|Black Augurite|Peat Block/.test(l) ||
    lines.some((o) => o !== l && /^Use (.+?)(,|$)/.test(l) && o.toLowerCase().includes(`holding ${l.match(/^Use (.+?)(,|$)/)![1]!.toLowerCase()}`));
  if (lines.some((l) => !sideGame(l))) lines = lines.filter((l) => !sideGame(l));
  const atPlace = lines.filter((l) => /^(At|Level up at) /.test(l));
  const other = lines.filter((l) => !atPlace.includes(l));
  if (atPlace.length === 0) return other;
  if (other.length > 0) return other;
  return [`Level up at a special location (e.g. ${atPlace[0]!.replace(/^(At|Level up at) /, "")})`];
}

function rawEvoConditions(details: Json[]): string[] {
  return details.map((d) => {
    const parts: string[] = [];
    const trigger = d.trigger?.name;
    if (trigger === "trade") parts.push("Trade");
    if (trigger === "use-item" && d.item) parts.push(`Use ${titleCase(d.item.name)}`);
    if (trigger === "shed") parts.push("Empty slot + Poké Ball when Nincada evolves");
    if (d.min_level) parts.push(`Level ${d.min_level}`);
    if (d.held_item) parts.push(`holding ${titleCase(d.held_item.name)}`);
    if (d.trade_species) parts.push(`for ${titleCase(d.trade_species.name)}`);
    if (d.min_happiness) parts.push("High friendship");
    if (d.min_affection) parts.push("High affection");
    if (d.min_beauty) parts.push("High beauty");
    if (d.known_move) parts.push(`knowing ${titleCase(d.known_move.name)}`);
    if (d.known_move_type) parts.push(`knowing a ${titleCase(d.known_move_type.name)} move`);
    if (d.location) parts.push(`at ${titleCase(d.location.name)}`);
    if (d.time_of_day) parts.push(d.time_of_day === "day" ? "during the day" : `at ${d.time_of_day}`);
    if (d.gender === 1) parts.push("female");
    if (d.gender === 2) parts.push("male");
    if (d.party_species) parts.push(`with ${titleCase(d.party_species.name)} in party`);
    if (d.party_type) parts.push(`with a ${titleCase(d.party_type.name)} type in party`);
    if (d.relative_physical_stats === 1) parts.push("Attack > Defense");
    if (d.relative_physical_stats === -1) parts.push("Attack < Defense");
    if (d.relative_physical_stats === 0) parts.push("Attack = Defense");
    if (d.needs_overworld_rain) parts.push("while raining");
    if (d.turn_upside_down) parts.push("holding the device upside down");
    if (trigger === "level-up" && !d.min_level && parts.length === 0) parts.push("Level up");
    if (parts.length === 0) parts.push(titleCase(trigger ?? "special"));
    const s = parts.join(", ");
    return s.charAt(0).toUpperCase() + s.slice(1);
  });
}

// ---------- main ----------
async function main() {
  await access(path.join(SOURCE, "pets.json")).catch(() => {
    throw new Error(`Sprite source not found at ${SOURCE}. Pass --source <path to codex-pokepets checkout>.`);
  });
  const registry: Json[] = JSON.parse(await readFile(path.join(SOURCE, "pets.json"), "utf8")).pets;
  const bySlug = new Map(registry.map((p) => [p.slug, p]));
  const roster: string[] = JSON.parse(await readFile(path.join(PACK_DIR, "roster.json"), "utf8"));
  const rosterSet = new Set(roster);

  for (const s of roster) if (!bySlug.has(s)) throw new Error(`Roster slug not in source: ${s}`);

  // species per roster pet
  const speciesIds = [...new Set(roster.map((s) => bySlug.get(s).pokedex_id as number))];
  const speciesList = await mapLimit(speciesIds, 12, (id) => api(`/api/v2/pokemon-species/${id}/`));
  const species = new Map(speciesList.map((s) => [s.id as number, s]));

  // type chart
  const typeData = await mapLimit(ELEMENTS.map((e) => e[0]), 6, async (t) => {
    const list = await api("/api/v2/type/");
    const entry = list.results.find((r: Json) => r.name === t);
    return api(entry.url);
  });
  const chart = new Map<string, Json>(typeData.map((t) => [t.name, t.damage_relations]));

  // which slug represents each species in the roster (base form preferred)
  const speciesSlug = new Map<string, string>();
  for (const s of roster) {
    const p = bySlug.get(s);
    const key = p.species_slug ?? s;
    if (p.category === "pokemon" || !speciesSlug.has(key)) speciesSlug.set(key, s);
  }

  const abilityCache = new Map<number, Json>();
  const summaries: PetSummary[] = [];
  const details: PetDetail[] = [];

  await mapLimit(roster, 8, async (slug) => {
    const src = bySlug.get(slug);
    const sp = species.get(src.pokedex_id)!;
    const isVariant = src.category !== "pokemon";
    const variety =
      (sp.varieties as Json[]).find((v) => v.pokemon.name === slug) ??
      (sp.varieties as Json[]).find((v) => v.is_default);
    const mon = await api(variety.pokemon.url);

    const abilities: Ability[] = await Promise.all(
      (mon.abilities as Json[]).map(async (a) => {
        const id = idFromUrl(a.ability.url);
        if (!abilityCache.has(id)) abilityCache.set(id, await api(a.ability.url));
        const ab = abilityCache.get(id);
        const effect =
          en(ab.effect_entries, "short_effect") ??
          [...(ab.flavor_text_entries as Json[])].reverse().find((f) => f.language.name === "en")?.flavor_text ??
          "";
        return { id: ab.name, name: en(ab.names) ?? titleCase(ab.name), hidden: a.is_hidden, effect: clean(effect) };
      }),
    );

    const elements = (mon.types as Json[]).sort((a, b) => a.slot - b.slot).map((t) => t.type.name as string);
    const defenses: Record<string, string[]> = {};
    for (const [atk] of ELEMENTS) {
      let m = 1;
      for (const def of elements) {
        const r = chart.get(def)!;
        if (r.double_damage_from.some((x: Json) => x.name === atk)) m *= 2;
        if (r.half_damage_from.some((x: Json) => x.name === atk)) m *= 0.5;
        if (r.no_damage_from.some((x: Json) => x.name === atk)) m *= 0;
      }
      if (m !== 1) (defenses[String(m)] ??= []).push(atk);
    }

    const stats: Record<string, number> = {};
    for (const s of mon.stats as Json[]) stats[STAT_IDS[s.stat.name]!] = s.base_stat;

    const speciesName = en(sp.names) ?? titleCase(sp.name);
    const name = isVariant ? `${speciesName} (${titleCase(slug.replace(`${sp.name}-`, ""))})` : speciesName;

    const genderRate: number = sp.gender_rate;
    const gender =
      genderRate === -1 ? "Genderless" : `${(((8 - genderRate) / 8) * 100).toFixed(1).replace(".0", "")}% ♂ · ${((genderRate / 8) * 100).toFixed(1).replace(".0", "")}% ♀`;

    const facts: Fact[] = [
      { id: "category", label: "Category", value: en(sp.genera, "genus") ?? "" },
      { id: "height", label: "Height", value: `${(mon.height / 10).toFixed(1)} m` },
      { id: "weight", label: "Weight", value: `${(mon.weight / 10).toFixed(1)} kg` },
      { id: "gender", label: "Gender", value: gender },
      { id: "egg-groups", label: "Egg groups", value: (sp.egg_groups as Json[]).map((e) => titleCase(e.name)).join(", ") || "—" },
      { id: "hatch", label: "Egg cycles", value: sp.hatch_counter != null ? String(sp.hatch_counter) : "—" },
      { id: "habitat", label: "Habitat", value: sp.habitat ? titleCase(sp.habitat.name) : "—" },
      { id: "color", label: "Color", value: titleCase(sp.color.name) },
      { id: "shape", label: "Shape", value: sp.shape ? titleCase(sp.shape.name) : "—" },
      { id: "capture", label: "Catch rate", value: String(sp.capture_rate) },
      { id: "friendship", label: "Base friendship", value: sp.base_happiness != null ? String(sp.base_happiness) : "—" },
      { id: "growth", label: "Growth rate", value: titleCase(sp.growth_rate.name) },
      { id: "base-exp", label: "Base exp.", value: mon.base_experience != null ? String(mon.base_experience) : "—" },
    ];

    const variants = roster.filter(
      (o) => o !== slug && bySlug.get(o).pokedex_id === src.pokedex_id,
    );

    const tags: string[] = [];
    if (sp.is_legendary) tags.push("legendary");
    if (sp.is_mythical) tags.push("mythical");
    if (sp.is_baby) tags.push("baby");
    if (isVariant) tags.push("form");

    const summary: PetSummary = {
      slug,
      name,
      number: src.pokedex_id,
      group: src.gen,
      elements,
      isVariant,
      ...(isVariant ? { baseSlug: speciesSlug.get(sp.name) } : {}),
      tags,
      spritesheet: `pets/${slug}/spritesheet.webp`,
    };
    summaries.push(summary);

    details.push({
      ...summary,
      category: en(sp.genera, "genus") ?? "",
      description: pickFlavor(sp),
      blurb: src.description,
      heightM: mon.height / 10,
      weightKg: mon.weight / 10,
      stats,
      abilities,
      facts,
      defenses,
      evolution: null, // filled below
      variants,
      flags: { legendary: sp.is_legendary, mythical: sp.is_mythical, baby: sp.is_baby },
    });
  });

  // evolution chains (may include species outside the roster → shown greyed out)
  const chainUrls = [...new Set(speciesList.map((s) => s.evolution_chain.url as string))];
  const chains = await mapLimit(chainUrls, 8, (u) => api(u));
  const extraIds = new Set<number>();
  const collect = (n: Json) => {
    const id = idFromUrl(n.species.url);
    if (!species.has(id)) extraIds.add(id);
    (n.evolves_to as Json[]).forEach(collect);
  };
  chains.forEach((c) => collect(c.chain));
  for (const s of await mapLimit([...extraIds], 12, (id) => api(`/api/v2/pokemon-species/${id}/`))) species.set(s.id, s);

  const toNode = (n: Json): EvolutionNode => {
    const sp = species.get(idFromUrl(n.species.url))!;
    const slug = speciesSlug.get(sp.name);
    return {
      key: sp.name,
      name: en(sp.names) ?? titleCase(sp.name),
      number: sp.id,
      ...(slug ? { slug } : {}),
      conditions: evoConditions(n.evolution_details),
      children: (n.evolves_to as Json[]).map(toNode),
    };
  };
  const chainBySpecies = new Map<number, EvolutionNode>();
  for (const c of chains) {
    const tree = toNode(c.chain);
    const walk = (n: EvolutionNode) => {
      chainBySpecies.set(n.number, tree);
      n.children.forEach(walk);
    };
    walk(tree);
  }
  for (const d of details) {
    const tree = chainBySpecies.get(d.number) ?? null;
    d.evolution = tree && tree.children.length ? tree : null;
  }

  // ---------- write ----------
  summaries.sort((a, b) => a.number - b.number || Number(a.isVariant) - Number(b.isVariant));
  await mkdir(path.join(PACK_DIR, "data/pets"), { recursive: true });

  const manifest: PackManifest = {
    id: "pokemon",
    name: "Pokémon (fan pack)",
    version: "0.1.0",
    description: "Gen 1–4 pixel-art pets from the Black/White animated sprites.",
    attribution:
      "Pokémon and sprite artwork © Nintendo / Game Freak / Creatures Inc. Sprites via PokeAPI/sprites and codex-pokepets. Data via PokeAPI.",
    license: "Non-commercial fan use",
    atlas: CODEX_ATLAS,
    numberLabel: "No.",
    statSchema: [
      { id: "hp", label: "HP", short: "HP", max: 255 },
      { id: "atk", label: "Attack", short: "Atk", max: 190 },
      { id: "def", label: "Defense", short: "Def", max: 230 },
      { id: "spa", label: "Sp. Attack", short: "SpA", max: 194 },
      { id: "spd", label: "Sp. Defense", short: "SpD", max: 230 },
      { id: "spe", label: "Speed", short: "Spe", max: 200 },
    ],
    elements: ELEMENTS.map(([id, color]) => ({ id, label: titleCase(id), color })),
    counts: { pets: summaries.length },
  };
  await writeFile(path.join(PACK_DIR, "pack.json"), JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(
    path.join(PACK_DIR, "data/index.json"),
    "[\n" + summaries.map((s) => JSON.stringify(s)).join(",\n") + "\n]\n",
  );
  for (const d of details) {
    await writeFile(path.join(PACK_DIR, "data/pets", `${d.slug}.json`), JSON.stringify(d, null, 2) + "\n");
    const dir = path.join(PACK_DIR, "pets", d.slug);
    await mkdir(dir, { recursive: true });
    await copyFile(path.join(SOURCE, "pets", d.slug, "spritesheet.webp"), path.join(dir, "spritesheet.webp"));
  }
  const missing = [...species.values()].filter((s) => !speciesSlug.has(s.name)).map((s) => s.name);
  console.log(`Wrote ${details.length} pets to packs/pokemon. Chain stages not in roster: ${missing.length}`);
  if (rosterSet.size !== roster.length) console.warn("Roster has duplicate slugs.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
