import type { Metadata } from "next";
import Link from "next/link";
import { GROWTH_THRESHOLDS_MS } from "@pokepet/core";
import { routes, site } from "@/lib/site";
import { getEvolutionIndex, listPets } from "@/lib/packs";
import { DownloadButton } from "@/features/download/DownloadButton";
import { InstallGuide, type Guide } from "@/features/download/InstallGuide";

export const metadata: Metadata = {
  title: "Download",
  description: `Get ${site.name} for Windows and Android: pixel pets that live on your screen and evolve the longer they stay.`,
};

const [firstStep, secondStep] = GROWTH_THRESHOLDS_MS.map((ms) => Math.round(ms / 3_600_000));

const windows: Guide = {
  steps: [
    { title: "Download", body: "Get the installer above. It's free, small, and doesn't need admin rights." },
    { title: "Install", body: "Open PokePet-Setup.exe and follow the two quick steps. PokePet opens when it's done." },
    {
      title: "Meet your pet",
      body: "If you picked a pet here before downloading, it's already on your screen. Otherwise pick one in the app, or click Adopt on any pet page.",
    },
  ],
  faqs: [
    {
      q: "Windows says \"Windows protected your PC\"",
      a: "That shows up for new apps that aren't signed with a paid certificate yet. Click More info, then Run anyway.",
    },
    {
      q: "What can I do with my pet?",
      a: "Click it to pet it, drag it anywhere and let go, or right-click it and then click a spot to send it walking there. Double-click it to open the PokePet window.",
    },
    {
      q: "Does it start with Windows?",
      a: "Yes, so your pet is there when you log in. You can turn that off from the PokePet icon in the system tray.",
    },
    { q: "How do I uninstall it?", a: "Settings → Apps → Installed apps → PokePet → Uninstall." },
  ],
};

const android: Guide = {
  steps: [
    {
      title: "Download",
      body: "Tap Download for Android to get PokePet.apk. If your browser warns about this type of file, tap Download anyway.",
    },
    {
      title: "Install",
      body: "Open PokePet.apk. If Android asks, allow your browser to install apps, go back, and tap Install.",
    },
    {
      title: "Meet your pet",
      body: "Open PokePet, adopt a pet, and tap Set as wallpaper. Your pet then lives on your home screen and lock screen.",
    },
  ],
  faqs: [
    {
      q: "Play Protect says the app is unknown",
      a: "PokePet isn't on the Play Store yet, so Google doesn't recognise it. Tap More details, then Install anyway.",
    },
    {
      q: "Does it replace my wallpaper?",
      a: "Yes: on a phone your pet lives on your wallpaper, and PokePet asks before it replaces yours. You can put a photo of your own behind your pet, or choose Lock screen when Android asks to keep your home screen as it is.",
    },
    {
      q: "Will my pet walk over my apps?",
      a: "Not unless you want it to. Your pet stays on your home screen and lock screen. To have it come along over your apps too, turn on Walk over my apps in PokePet's Phone tab.",
    },
    {
      q: "What can I do with my pet?",
      a: "Tap an empty spot on your home screen to send it walking there, or tap the pet itself to poke it.",
    },
    {
      q: "How do I update it?",
      a: "Download PokePet.apk from this page again and install it over the old one. Your pets and their time are kept.",
    },
    {
      q: "Android says the app isn't compatible",
      a: "PokePet needs a 64-bit phone running Android 7 or newer. Almost every phone from the last several years qualifies; some very old or very cheap ones don't.",
    },
    { q: "How do I uninstall it?", a: "Press and hold the PokePet icon, tap App info, then Uninstall." },
  ],
};

const shared = [
  {
    q: "How do pets evolve?",
    a: `Only while they're on your screen. After ${firstStep} hours a pet evolves, and after ${secondStep} hours in total it evolves again. Swap pets any time: each one keeps its own time.`,
  },
];

export default async function DownloadPage() {
  const [pets, evolution] = await Promise.all([listPets(site.defaultPack), getEvolutionIndex(site.defaultPack)]);
  // Only first forms can be adopted, so only those can ride along with the download.
  const adoptableNames = Object.fromEntries(pets.filter((p) => evolution[p.slug]?.adoptable).map((p) => [p.slug, p.name]));
  return (
    <div className="container-pp pt-12 flex flex-col gap-12 max-w-3xl">
      <section className="flex flex-col gap-4">
        <h1 className="font-display text-4xl sm:text-5xl font-bold">A pixel pet for your desktop and phone</h1>
        <p className="text-lg text-muted max-w-xl leading-relaxed">
          Adopt a pet and it lives along the bottom of your screen, or on your phone&apos;s home screen and lock screen. Pet it, play with
          it, and keep it close: the longer it stays, the sooner it evolves.
        </p>
        <div className="pt-2">
          <DownloadButton names={adoptableNames} />
        </div>
      </section>

      <InstallGuide windows={windows} android={android} shared={shared} />

      <p className="text-sm text-muted">
        Want to look around first? <Link href={routes.home} className="underline underline-offset-4 hover:text-ink">Browse all the pets</Link>.
      </p>
    </div>
  );
}
