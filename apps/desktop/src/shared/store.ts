import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/**
 * The user's pets, as kept by the native side (see src-tauri/src/collection.rs).
 * Both windows read and change it through here and hear about every change, so
 * the pet on screen and the PokePet window always agree.
 *
 * Outside Tauri (plain `vite` in a browser, for UI work) it falls back to
 * localStorage, without the on-screen clock.
 */
export interface OwnedPet {
  id: string;
  species: string;
  /** Evolution line (first form). Only one pet per line. */
  line: string;
  adoptedAt: number;
  /** Total time on screen in ms. Drives evolution. */
  onScreenMs: number;
}

export interface Collection {
  pets: OwnedPet[];
  active: string | null;
}

export interface Evolved {
  id: string;
  from: string;
  to: string;
}

export const activePet = (c: Collection) => c.pets.find((p) => p.id === c.active) ?? null;
/** The pet you own from this evolution line, if any. */
export const ownedFromLine = (c: Collection, line: string) => c.pets.find((p) => p.line === line) ?? null;

type Listener = (c: Collection) => void;

interface Backend {
  get(): Promise<Collection>;
  adopt(species: string, line: string): Promise<OwnedPet>;
  evolve(id: string, into: string): Promise<void>;
  setActive(id: string | null): Promise<void>;
  release(id: string): Promise<void>;
  subscribe(fn: Listener): () => void;
  onEvolved(fn: (e: Evolved) => void): () => void;
  openManager(): Promise<void>;
}

const on = <T,>(event: string, fn: (payload: T) => void) => {
  const off = listen<T>(event, (e) => fn(e.payload));
  return () => void off.then((stop) => stop());
};

const nativeBackend: Backend = {
  get: () => invoke<Collection>("get_collection"),
  adopt: (species, line) => invoke<OwnedPet>("adopt", { species, line }),
  evolve: (id, into) => invoke("evolve", { id, into }),
  setActive: (id) => invoke("set_active", { id }),
  release: (id) => invoke("release", { id }),
  subscribe: (fn) => on<Collection>("collection-changed", fn),
  onEvolved: (fn) => on<Evolved>("pet-evolved", fn),
  openManager: () => invoke("open_manager"),
};

/** Browser-only stand-in so the UI can be developed with plain `vite`. */
function localBackend(): Backend {
  const KEY = "pp-collection";
  const channel = new BroadcastChannel(KEY);
  const listeners = new Set<Listener>();
  const evolvedListeners = new Set<(e: Evolved) => void>();
  const read = (): Collection => JSON.parse(localStorage.getItem(KEY) ?? '{"pets":[],"active":null}');
  const write = (c: Collection, evolved?: Evolved) => {
    localStorage.setItem(KEY, JSON.stringify(c));
    channel.postMessage({ c, evolved });
    listeners.forEach((fn) => fn(c));
    if (evolved) evolvedListeners.forEach((fn) => fn(evolved));
  };
  channel.onmessage = (e) => {
    const { c, evolved } = e.data as { c: Collection; evolved?: Evolved };
    listeners.forEach((fn) => fn(c));
    if (evolved) evolvedListeners.forEach((fn) => fn(evolved));
  };
  return {
    get: async () => read(),
    async adopt(species, line) {
      const c = read();
      if (c.pets.some((p) => p.line === line || p.species === species)) throw "You already have this pet.";
      const pet: OwnedPet = { id: `${species}-${Date.now()}`, species, line, adoptedAt: Date.now(), onScreenMs: 0 };
      write({ pets: [...c.pets, pet], active: pet.id });
      return pet;
    },
    async evolve(id, into) {
      const c = read();
      const pet = c.pets.find((p) => p.id === id);
      if (!pet || pet.species === into) throw "Nothing to evolve.";
      const from = pet.species;
      write({ ...c, pets: c.pets.map((p) => (p.id === id ? { ...p, species: into } : p)) }, { id, from, to: into });
    },
    onEvolved(fn) {
      evolvedListeners.add(fn);
      return () => evolvedListeners.delete(fn);
    },
    async setActive(id) {
      write({ ...read(), active: id });
    },
    async release(id) {
      const c = read();
      write({ pets: c.pets.filter((p) => p.id !== id), active: c.active === id ? null : c.active });
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    openManager: async () => void window.open("/manager.html", "_blank"),
  };
}

export const store: Backend = isTauri() ? nativeBackend : localBackend();
