import { site } from "@/lib/site";
import { getManifest, listPets } from "@/lib/packs";
import { DexBrowser } from "@/features/dex/DexBrowser";

export default async function HomePage() {
  const [pack, pets] = await Promise.all([getManifest(site.defaultPack), listPets(site.defaultPack)]);
  return (
    <div className="container-pp pt-10">
      <section className="mb-8 flex flex-col gap-2">
        <h1 className="font-display text-3xl sm:text-4xl font-bold">Pick your pixel pet</h1>
        <p className="text-muted max-w-xl">
          {pets.length} animated pets. Hover a card to see it move, open one for stats, abilities and its full evolution line.
        </p>
      </section>
      <DexBrowser pack={pack} pets={pets} />
    </div>
  );
}
