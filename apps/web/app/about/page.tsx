import type { Metadata } from "next";
import { site } from "@/lib/site";
import { getManifest } from "@/lib/packs";

export const metadata: Metadata = { title: "About" };

export default async function AboutPage() {
  const pack = await getManifest(site.defaultPack);
  return (
    <div className="container-pp pt-10 max-w-2xl flex flex-col gap-6 leading-relaxed">
      <h1 className="font-display text-3xl font-bold">About {site.name}</h1>
      <p>
        {site.name} is a small collection of animated pixel pets. Today you can browse them, see how they move and read about
        each one. Soon you will be able to adopt one as a desktop pet that walks along the bottom of your screen.
      </p>
      <h2 className="font-display text-xl font-medium">Credits</h2>
      <ul className="list-disc pl-5 flex flex-col gap-1 text-muted">
        <li>Sprite artwork from the Pokémon Black and White games, via PokeAPI/sprites and the codex-pokepets pack.</li>
        <li>Species data from PokeAPI.</li>
      </ul>
      <h2 className="font-display text-xl font-medium">Legal</h2>
      <p className="text-muted">
        {site.name} is a free, non-commercial fan project and is not affiliated with or endorsed by Nintendo, Game Freak,
        Creatures Inc. or The Pokémon Company. {pack.attribution}
      </p>
    </div>
  );
}
