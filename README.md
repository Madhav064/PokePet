# PokePet

Animated pixel pets you can browse today and, soon, adopt as desktop and phone companions.

Phase 1 is the website: a fast, static dex of 175 pixel pets with stats, abilities, type defenses and full evolution lines.

## Repo layout

```
pokepet/
├── apps/
│   └── web/                 Next.js website (deployed on Vercel)
├── packages/
│   ├── core/                Pack format, atlas spec, search/filter logic. No UI, no franchise names.
│   ├── sprite-engine/       Framework-free spritesheet player (works in web, desktop and mobile webviews)
│   ├── ui/                  Shared React components: Sprite, PetCard, StatBars, EvolutionTree…
│   └── data/                Importers that build packs (PokeAPI importer lives here)
└── packs/
    └── pokemon/             The first pet pack
        ├── roster.json      Which pets are included: edit this to add or remove pets
        ├── pack.json        Pack manifest (atlas layout, stat schema, element colors)
        ├── data/            Generated pet data (index + one file per pet)
        └── pets/<slug>/     Spritesheets
```

**Why packs?** Apps only ever talk to the generic pack format in `@pokepet/core`. A future pack of original characters
drops into `packs/` and works everywhere with no code changes.

## Quick start

Requires Node 22.18+ and pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm dev            # http://localhost:3000
pnpm build          # production build of everything
pnpm typecheck
```

## Adding or removing pets

1. Edit `packs/pokemon/roster.json` (slugs from the [codex-pokepets](https://github.com/madhav064/pokemon-pets) registry).
2. Clone that repo next to this one (`../Pokemon-Pets`) or pass `--source`.
3. Rebuild the pack:

```bash
pnpm pack:pokemon -- --source ../Pokemon-Pets
```

Data comes from PokeAPI's static mirror on GitHub and is cached in `.cache/`.

## Deploying to Vercel

1. Import this repo in Vercel.
2. Set **Root Directory** to `apps/web`. Vercel detects Next.js, pnpm and the monorepo automatically.
3. Deploy. Every page is pre-rendered, so it is fast and cheap to host.

## Roadmap

1. ✅ Website: browse pets, stats, evolutions
2. Launch on a custom domain
3. Desktop pet app (Tauri): pets walk along your screen, follow the cursor, react to petting; starts on boot
4. One-click "Adopt" from the website into the desktop app
5. Mobile app
6. AI-powered pets
7. Original character packs and monetization

## Legal

PokePet is a free, non-commercial fan project, not affiliated with Nintendo, Game Freak, Creatures Inc. or The Pokémon Company.
Pokémon sprite artwork © its owners, used for non-commercial fan purposes. Code in this repository is MIT licensed.
