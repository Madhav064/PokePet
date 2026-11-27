import { useCallback, useEffect, useState } from "react";
import { isPhone, phone } from "../shared/phone.ts";
import { ownedFromLine, store } from "../shared/store.ts";
import { Browse } from "./Browse.tsx";
import { loadPack, useCollection, type PackData } from "./data.ts";
import { MyPets } from "./MyPets.tsx";
import { OwnedPetPage } from "./OwnedPetPage.tsx";
import { PetPage } from "./PetPage.tsx";
import { UpdateBanner } from "./UpdateBanner.tsx";
import { useUpdate } from "../shared/updates.ts";
import { petHasAHome, PhoneSettings, PickUpDialog, usePhoneStatus, WallpaperBanner, WallpaperDialog } from "./PhoneSettings.tsx";

/** Remembers that "Pick up your pet?" was asked, so it's only asked once. */
const ASKED_PICK_UP = "pp-asked-pick-up";

type View = { tab: "pets"; petId?: string } | { tab: "browse"; pet?: string } | { tab: "phone" };

export function App() {
  const [data, setData] = useState<PackData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const collection = useCollection();
  const [view, setView] = useState<View>({ tab: "pets" });
  const [toast, setToast] = useState<string | null>(null);
  const [phoneStatus, setPhoneStatus] = usePhoneStatus();
  const update = useUpdate();
  /** The "this replaces your wallpaper" question, open (with the new pet's name after adopting). */
  const [askWallpaper, setAskWallpaper] = useState<{ petName?: string } | null>(null);
  /** "Pick up your pet?", asked once after the wallpaper is set. */
  const [askPickUp, setAskPickUp] = useState(false);

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
      // On a phone with nowhere for the pet to live yet, explain the wallpaper instead of
      // claiming it's on screen.
      const homeless = isPhone && !petHasAHome(phoneStatus);
      void run(async () => {
        const pet = await store.adopt(slug, line);
        go({ tab: "pets", petId: pet.id });
        if (homeless) setAskWallpaper({ petName: name });
      }, homeless ? undefined : `${name} is on your screen!`);
    },
    [data, run, go, phoneStatus],
  );

  // "Adopt" on the website opens pokepet://adopt/<pet>: adopt it in one go when we can,
  // otherwise show the right page (your existing pet, or what to adopt instead).
  useEffect(() => {
    if (!data) return;
    const handle = async (slug: string) => {
      const evo = data.evolution[slug];
      const name = data.bySlug.get(slug)?.name ?? slug;
      if (!evo) return setToast("That pet isn't in PokePet.");
      const owned = ownedFromLine(await store.get(), evo.base);
      if (owned) {
        go({ tab: "pets", petId: owned.id });
        const ownedName = data.bySlug.get(owned.species)?.name ?? owned.species;
        return setToast(owned.species === slug ? `${name} is already yours` : `You already have this line: your ${ownedName}`);
      }
      if (!evo.adoptable) return go({ tab: "browse", pet: slug });
      adopt(slug);
    };
    const drain = () => void store.takePendingAdoptions().then((slugs) => slugs.forEach((s) => void handle(s)));
    drain();
    return store.onAdoptLink(drain);
  }, [data, adopt, go]);

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
  // On a phone the pet only shows up once PokePet is the wallpaper (or walks over apps).
  const needsHome = isPhone && collection.pets.length > 0 && !petHasAHome(phoneStatus);
  const setWallpaper = () => {
    setAskWallpaper(null);
    void phone.setWallpaper().then(
      (s) => {
        setPhoneStatus(s);
        if (!s.wallpaperSet) return;
        if (!s.canPickUp && !localStorage.getItem(ASKED_PICK_UP)) {
          localStorage.setItem(ASKED_PICK_UP, "1");
          setAskPickUp(true);
        } else {
          setToast("Your pet moved onto your home screen!");
        }
      },
      () => setToast("Couldn't open the wallpaper picker."),
    );
  };
  const askToSetWallpaper = () => setAskWallpaper({});
  const active = collection.pets.find((p) => p.id === collection.active);
  const activeName = active ? (data.bySlug.get(active.species)?.name ?? "your pet") : "your pet";
  const ownedPet = view.tab === "pets" && view.petId ? collection.pets.find((p) => p.id === view.petId) : undefined;

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="container-pp flex h-14 items-center gap-5 sm:gap-8">
          <span className="flex items-center gap-2 font-display text-xl font-bold tracking-wide">
            <span aria-hidden="true" className="inline-block size-3 bg-accent" />
            {/* Narrow phones need the room for the tabs. */}
            <span className="max-[420px]:sr-only">PokePet</span>
          </span>
          <nav className="flex items-center gap-4 sm:gap-6" role="tablist">
            <button type="button" role="tab" className="tab" aria-selected={view.tab === "pets"} onClick={() => go({ tab: "pets" })}>
              My Pets <span className="count">{collection.pets.length}</span>
            </button>
            <button type="button" role="tab" className="tab" aria-selected={view.tab === "browse"} onClick={() => go({ tab: "browse" })}>
              Browse
            </button>
            {isPhone && (
              <button type="button" role="tab" className="tab" aria-selected={view.tab === "phone"} onClick={() => go({ tab: "phone" })}>
                Phone
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="container-pp flex-1 pt-8 pb-16">
        {update && <UpdateBanner update={update} onError={setToast} />}
        {needsHome && view.tab !== "phone" && <WallpaperBanner onSet={askToSetWallpaper} />}
        {view.tab === "phone" ? (
          <PhoneSettings status={phoneStatus} onSetWallpaper={askToSetWallpaper} onChange={setPhoneStatus} onToast={setToast} />
        ) : view.tab === "pets" ? (
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

      {askWallpaper && (
        <WallpaperDialog petName={askWallpaper.petName} onConfirm={setWallpaper} onCancel={() => setAskWallpaper(null)} />
      )}

      {askPickUp && (
        <PickUpDialog
          petName={activeName}
          onCancel={() => setAskPickUp(false)}
          onAllow={() => {
            setAskPickUp(false);
            void phone.allowPickUp().then((s) => {
              setPhoneStatus(s);
              setToast(s.canPickUp ? "Now you can pick up your pet on your home screen" : "Your pet moved onto your home screen!");
            }, () => {});
          }}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
