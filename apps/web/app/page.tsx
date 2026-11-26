import Link from "next/link";
import { routes, site } from "@/lib/site";
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
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Link href={routes.download} className="h-10 px-4 rounded-xl bg-accent text-white font-semibold inline-flex items-center hover:brightness-95">
            Get the desktop app
          </Link>
          <span className="text-sm text-muted">Adopt a pet and it lives on your screen, evolving the longer it stays.</span>
        </div>
      </section>
      <DexBrowser pack={pack} pets={pets} />
    </div>
  );
}
