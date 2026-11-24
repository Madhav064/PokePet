import { useCallback, useEffect, useState } from "react";
import { store } from "../shared/store.ts";
import { Browse } from "./Browse.tsx";
import { loadPack, useCollection, type PackData } from "./data.ts";
import { MyPets } from "./MyPets.tsx";
import { OwnedPetPage } from "./OwnedPetPage.tsx";
import { PetPage } from "./PetPage.tsx";

type View = { tab: "pets"; petId?: string } | { tab: "browse"; pet?: string };

export function App() {
  const [data, setData] = useState<PackData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const collection = useCollection();
  const [view, setView] = useState<View>({ tab: "pets" });
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    loadPack().then(setData, () => setError("Couldn't load the pets that ship with the app."));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(t);
  }, [toast]);
  // First visit with no pets yet: start on Browse.
  const empty = collection?.pets.length === 0;
  useEffect(() => {
    if (empty) setView((v) => (v.tab === "pets" ? { tab: "browse" } : v));
  }, [empty]);
  // Celebrate evolutions, even ones that happen while you're looking at something else.
  useEffect(() => {
    if (!data) return;
    const name = (slug: string) => data.bySlug.get(slug)?.name ?? slug;
    return store.onEvolved((e) => setToast(`Your ${name(e.from)} evolved into ${name(e.to)}!`));
  }, [data]);

  const go = useCallback((v: View) => {
    setView(v);
    window.scrollTo({ top: 0 });
  }, []);
  const openPet = useCallback((slug: string) => go({ tab: "browse", pet: slug }), [go]);
  const openOwned = useCallback((id: string) => go({ tab: "pets", petId: id }), [go]);

  const run = useCallback(async (action: () => Promise<unknown>, done?: string) => {
    try {
      await action();
      if (done) setToast(done);
    } catch (e) {
      setToast(typeof e === "string" ? e : "Something went wrong. Please try again.");
    }
  }, []);

  const adopt = useCallback(
    (slug: string) => {
      if (!data) return;
      const name = data.bySlug.get(slug)?.name ?? "Your new pet";
      const line = data.evolution[slug]?.base ?? slug;
      void run(async () => {
        const pet = await store.adopt(slug, line);
        go({ tab: "pets", petId: pet.id });
      }, `${name} is on your screen!`);
    },
    [data, run, go],
  );

  if (error) return <p className="p-10 text-muted">{error}</p>;
  if (!data || !collection) return <p className="p-10 text-muted">Loading…</p>;

  const nameOf = (id: string) => {
    const p = collection.pets.find((x) => x.id === id);
    return p ? (data.bySlug.get(p.species)?.name ?? p.species) : "Your pet";
  };
  const setActive = (id: string | null, name: string) =>
    void run(() => store.setActive(id), id ? `${name} is on your screen` : `${name} is resting`);
  const release = (id: string, name: string) =>
    void run(async () => {
      await store.release(id);
      setView((v) => (v.tab === "pets" && v.petId === id ? { tab: "pets" } : v));
    }, `${name} was released`);
  const ownedPet = view.tab === "pets" && view.petId ? collection.pets.find((p) => p.id === view.petId) : undefined;

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="container-pp flex h-14 items-center gap-8">
          <span className="flex items-center gap-2 font-display text-xl font-bold tracking-wide">
            <span aria-hidden="true" className="inline-block size-3 bg-accent" />
            PokePet
          </span>
          <nav className="flex items-center gap-6" role="tablist">
            <button type="button" role="tab" className="tab" aria-selected={view.tab === "pets"} onClick={() => go({ tab: "pets" })}>
              My Pets <span className="count">{collection.pets.length}</span>
            </button>
            <button type="button" role="tab" className="tab" aria-selected={view.tab === "browse"} onClick={() => go({ tab: "browse" })}>
              Browse
            </button>
          </nav>
        </div>
      </header>

      <main className="container-pp flex-1 pt-8 pb-16">
        {view.tab === "pets" ? (
          ownedPet ? (
            <OwnedPetPage
              data={data}
              pet={ownedPet}
              isActive={ownedPet.id === collection.active}
              onBack={() => go({ tab: "pets" })}
              onOpenSpecies={openPet}
              onSetActive={(id) => setActive(id, nameOf(ownedPet.id))}
              onRelease={(id) => release(id, nameOf(id))}
            />
          ) : (
            <MyPets
              data={data}
              collection={collection}
              onBrowse={() => go({ tab: "browse" })}
              onOpenOwned={openOwned}
              onSetActive={setActive}
              onRelease={release}
            />
          )
        ) : view.pet ? (
          <PetPage
            key={view.pet}
            data={data}
            slug={view.pet}
            collection={collection}
            onBack={() => go({ tab: "browse" })}
            onOpen={openPet}
            onOpenOwned={openOwned}
            onAdopt={adopt}
          />
        ) : (
          <Browse data={data} collection={collection} onOpen={openPet} />
        )}
      </main>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
