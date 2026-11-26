import type { Metadata } from "next";
import Link from "next/link";
import { GROWTH_THRESHOLDS_MS } from "@pokepet/core";
import { routes, site } from "@/lib/site";
import { getEvolutionIndex, listPets } from "@/lib/packs";
import { DownloadButton } from "@/features/download/DownloadButton";

export const metadata: Metadata = {
  title: "Download",
  description: `Get ${site.name} for Windows: pixel pets that live on your desktop and evolve the longer they stay.`,
};

const [firstStep, secondStep] = GROWTH_THRESHOLDS_MS.map((ms) => Math.round(ms / 3_600_000));

const steps = [
  { title: "Download", body: "Get the installer below. It's free, small, and doesn't need admin rights." },
  { title: "Install", body: "Open PokePet-Setup.exe and follow the two quick steps. PokePet opens when it's done." },
  {
    title: "Meet your pet",
    body: "If you picked a pet here before downloading, it's already on your screen. Otherwise pick one in the app, or click Adopt on any pet page.",
  },
];

const faqs = [
  {
    q: "Windows says \"Windows protected your PC\"",
    a: "That shows up for new apps that aren't signed with a paid certificate yet. Click More info, then Run anyway.",
  },
  {
    q: "How do pets evolve?",
    a: `Only while they're on your screen. After ${firstStep} hours a pet evolves, and after ${secondStep} hours in total it evolves again. Swap pets any time: each one keeps its own time.`,
  },
  {
    q: "What can I do with my pet?",
    a: "Click it to pet it, drag it anywhere and let go, or right-click it and then click a spot to send it walking there. Double-click it to open the PokePet window.",
  },
  {
    q: "Does it start with Windows?",
    a: "Yes, so your pet is there when you log in. You can turn that off from the PokePet icon in the system tray.",
  },
  {
    q: "How do I uninstall it?",
    a: "Settings → Apps → Installed apps → PokePet → Uninstall.",
  },
];

export default async function DownloadPage() {
  const [pets, evolution] = await Promise.all([listPets(site.defaultPack), getEvolutionIndex(site.defaultPack)]);
  // Only first forms can be adopted, so only those can ride along with the download.
  const adoptableNames = Object.fromEntries(pets.filter((p) => evolution[p.slug]?.adoptable).map((p) => [p.slug, p.name]));
  return (
    <div className="container-pp pt-12 flex flex-col gap-12 max-w-3xl">
      <section className="flex flex-col gap-4">
        <h1 className="font-display text-4xl sm:text-5xl font-bold">A pixel pet for your desktop</h1>
        <p className="text-lg text-muted max-w-xl leading-relaxed">
          Adopt a pet and it lives along the bottom of your screen. Pet it, carry it around, and keep it close: the longer it stays, the
          sooner it evolves.
        </p>
        <div className="pt-2">
          <DownloadButton names={adoptableNames} />
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.title} className="rounded-2xl border border-line bg-surface p-5 flex flex-col gap-2">
            <span className="font-display text-2xl text-accent">{i + 1}</span>
            <h2 className="font-semibold">{s.title}</h2>
            <p className="text-sm text-muted leading-relaxed">{s.body}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl font-medium">Questions</h2>
        <dl className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
          {faqs.map((f) => (
            <div key={f.q} className="p-5 flex flex-col gap-1">
              <dt className="font-semibold">{f.q}</dt>
              <dd className="text-sm text-muted leading-relaxed">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="text-sm text-muted">
        Want to look around first? <Link href={routes.home} className="underline underline-offset-4 hover:text-ink">Browse all the pets</Link>.
      </p>
    </div>
  );
}
