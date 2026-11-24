import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ElementBadge, EvolutionTree, StatBars } from "@pokepet/ui";
import { getManifest, getPet, listPets } from "@/lib/packs";
import { routes, site, spriteUrl } from "@/lib/site";
import { AppLink } from "@/lib/AppLink";
import { SpriteViewer } from "@/features/pet/SpriteViewer";
import { KeyNav } from "@/features/pet/KeyNav";
import { Defenses } from "@/features/pet/Defenses";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export async function generateStaticParams() {
  const pets = await listPets(site.defaultPack);
  return pets.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const pet = await getPet(site.defaultPack, slug);
  if (!pet) return {};
  return { title: pet.name, description: pet.description };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6 flex flex-col gap-4 min-w-0">
      <h2 className="font-display text-lg font-medium">{title}</h2>
      {children}
    </section>
  );
}

export default async function PetPage({ params }: Props) {
  const { slug } = await params;
  const [pack, pets, pet] = await Promise.all([
    getManifest(site.defaultPack),
    listPets(site.defaultPack),
    getPet(site.defaultPack, slug),
  ]);
  if (!pet) notFound();

  const elements = new Map(pack.elements.map((e) => [e.id, e]));
  const i = pets.findIndex((p) => p.slug === slug);
  const prev = pets[i - 1];
  const next = pets[i + 1];
  const num = `${pack.numberLabel} ${String(pet.number).padStart(3, "0")}`;
  const variants = [pet.slug, ...pet.variants]
    .map((s) => pets.find((p) => p.slug === s)!)
    .sort((a, b) => Number(a.isVariant) - Number(b.isVariant));

  return (
    <div className="container-pp pt-6 flex flex-col gap-6">
      <KeyNav prev={prev && routes.pet(prev.slug)} next={next && routes.pet(next.slug)} home={routes.home} />

      <nav className="flex items-center justify-between gap-3 text-sm text-muted" aria-label="Pet navigation">
        <Link href={routes.home} className="hover:text-ink">← All pets</Link>
        <div className="flex items-center gap-1">
          {prev ? (
            <Link href={routes.pet(prev.slug)} className="px-3 py-1.5 rounded-lg hover:bg-surface hover:text-ink truncate max-w-[40vw]">
              ‹ {prev.name}
            </Link>
          ) : null}
          {next ? (
            <Link href={routes.pet(next.slug)} className="px-3 py-1.5 rounded-lg hover:bg-surface hover:text-ink truncate max-w-[40vw]">
              {next.name} ›
            </Link>
          ) : null}
        </div>
      </nav>

      <div className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] items-start">
        <SpriteViewer atlas={pack.atlas} src={spriteUrl(pack.id, pet.slug)} name={pet.name} />

        <div className="flex flex-col gap-4 min-w-0">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted tabular-nums">{num}</span>
            <h1 className="font-display text-4xl sm:text-5xl font-bold">{pet.name}</h1>
            <span className="text-muted">{pet.category}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {pet.elements.map((e) => {
              const el = elements.get(e);
              return el ? <ElementBadge key={e} element={el} /> : null;
            })}
            {pet.flags.legendary && <span className="chip !cursor-default !h-7">Legendary</span>}
            {pet.flags.mythical && <span className="chip !cursor-default !h-7">Mythical</span>}
            {pet.flags.baby && <span className="chip !cursor-default !h-7">Baby</span>}
          </div>
          <p className="text-lg leading-relaxed max-w-prose">{pet.description}</p>
          {pet.blurb && pet.blurb !== pet.description && <p className="text-muted leading-relaxed max-w-prose">{pet.blurb}</p>}

          {variants.length > 1 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs uppercase tracking-wider text-muted">Forms</span>
              <div className="flex flex-wrap gap-2">
                {variants.map((v) =>
                  v.slug === pet.slug ? (
                    <span key={v.slug} className="chip" aria-pressed="true" aria-current="page">{v.name}</span>
                  ) : (
                    <Link key={v.slug} href={routes.pet(v.slug)} className="chip">{v.name}</Link>
                  ),
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button type="button" disabled className="h-11 px-5 rounded-xl bg-accent text-white font-semibold opacity-60 cursor-not-allowed">
              Adopt as desktop pet
            </button>
            <span className="text-sm text-muted">Coming soon</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Base stats">
          <StatBars schema={pack.statSchema} stats={pet.stats} />
        </Section>
        <Section title="Profile">
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-4">
            {pet.facts.map((f) => (
              <div key={f.id} className="min-w-0">
                <dt className="text-xs text-muted">{f.label}</dt>
                <dd className="font-medium text-sm mt-0.5 break-words">{f.value}</dd>
              </div>
            ))}
          </dl>
        </Section>
        <Section title="Abilities">
          <ul className="flex flex-col gap-3">
            {pet.abilities.map((a) => (
              <li key={a.id} className="flex flex-col gap-0.5">
                <span className="font-medium">
                  {a.name}
                  {a.hidden && <span className="ml-2 text-xs text-muted font-normal">Hidden ability</span>}
                </span>
                <span className="text-sm text-muted">{a.effect}</span>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Type defenses">
          <Defenses defenses={pet.defenses} elements={elements} />
        </Section>
      </div>

      <Section title="Evolution">
        {pet.evolution ? (
          <EvolutionTree
            root={pet.evolution}
            current={pet.slug}
            atlas={pack.atlas}
            spriteUrl={(s) => spriteUrl(pack.id, s)}
            hrefFor={routes.pet}
            Link={AppLink}
            numberLabel={pack.numberLabel}
          />
        ) : (
          <p className="text-muted text-sm">{pet.name} does not evolve.</p>
        )}
      </Section>

      <p className="text-xs text-muted text-center hidden sm:block">
        Tip: use <span className="kbd">←</span> <span className="kbd">→</span> to browse, <span className="kbd">Esc</span> to go back.
      </p>
    </div>
  );
}
