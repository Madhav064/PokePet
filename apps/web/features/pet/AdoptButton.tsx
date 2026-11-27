"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { adoptLink, androidDownloadUrl, downloadUrlFor, routes } from "@/lib/site";
import { clearPending, savePending } from "@/lib/pending";
import { usePlatform } from "@/lib/platform";

type Status = "idle" | "opening" | "opened" | "missing";

interface Props {
  slug: string;
  name: string;
  adoptable: boolean;
  /** First form of this line, when this pet can't be adopted itself. */
  base?: { slug: string; name: string };
  /** What it grows into, e.g. "After 5 h on your screen it grows into Ivysaur." */
  growthNote?: string;
}

/**
 * "Adopt" opens the PokePet app through a pokepet:// link. Browsers can't tell us
 * whether that worked, so we watch for the page losing focus (the app or the
 * browser's "Open PokePet?" prompt taking over). If nothing happens, we offer the download.
 */
export function AdoptButton({ slug, name, adoptable, base, growthNote }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const platform = usePlatform();
  const supported = platform !== "other";
  const android = platform === "android";
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!adoptable && base) {
    return (
      <div className="flex flex-col gap-2 pt-2">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={routes.pet(base.slug)} className="h-11 px-5 rounded-xl border border-line bg-surface font-semibold inline-flex items-center hover:border-ink/30">
            Adopt {base.name} instead
          </Link>
          <span className="text-sm text-muted">
            {name} can't be adopted directly. Adopt {base.name} and it grows into {name} on your screen.
          </span>
        </div>
      </div>
    );
  }
  if (!adoptable) {
    return <p className="text-sm text-muted pt-2">This form can't be adopted.</p>;
  }

  const adopt = () => {
    window.clearTimeout(timer.current);
    setStatus("opening");
    let left = false;
    const onLeave = () => (left = true);
    window.addEventListener("blur", onLeave, { once: true });
    document.addEventListener("visibilitychange", onLeave, { once: true });
    window.location.href = adoptLink(slug);
    timer.current = window.setTimeout(() => {
      window.removeEventListener("blur", onLeave);
      document.removeEventListener("visibilitychange", onLeave);
      setStatus(left ? "opened" : "missing");
      if (left) clearPending();
    }, 2200);
  };

  // The Windows download carries this pet, so the app adopts it on first launch. We also
  // remember it here, for when the installer can't pass it on and for Android, where the
  // site offers to finish adopting once the app is installed.
  const download = android
    ? { href: androidDownloadUrl, onClick: () => savePending(slug, name) }
    : { href: downloadUrlFor(slug), referrerPolicy: "unsafe-url" as const, onClick: () => savePending(slug, name) };
  const downloadLabel = android ? "Download for Android" : "Download for Windows";

  return (
    <div className="flex flex-col gap-3 pt-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={adopt}
          disabled={!supported || status === "opening"}
          className="h-11 px-5 rounded-xl bg-accent text-white font-semibold hover:brightness-95 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {status === "opening" ? "Opening PokePet…" : `Adopt ${name}`}
        </button>
        <span className="text-sm text-muted">
          {!supported ? "The PokePet app is for Windows and Android for now." : growthNote}
        </span>
      </div>

      {status === "opened" && (
        <p className="text-sm" role="status">
          {android ? `PokePet should have opened with ${name}.` : `Check your desktop: ${name} should be there.`} Didn&apos;t work?{" "}
          <a {...download} className="text-accent underline underline-offset-4">Get the app</a>.
        </p>
      )}
      {status === "missing" && (
        <div className="rounded-xl border border-line bg-surface p-4 flex flex-col gap-3 max-w-lg" role="status">
          <div className="flex flex-col gap-1">
            <span className="font-semibold">Get PokePet first</span>
            <span className="text-sm text-muted">
              It looks like the app isn&apos;t installed yet. It&apos;s free and takes a minute
              {android
                ? `. Once it's installed, come back here to finish adopting ${name}.`
                : `, and ${name} will be waiting on your screen when PokePet opens.`}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a {...download} className="h-10 px-4 rounded-lg bg-ink text-surface font-semibold inline-flex items-center">
              {downloadLabel}
            </a>
            <Link href={`${routes.download}?pet=${slug}`} className="text-sm text-muted hover:text-ink underline underline-offset-4">
              How it works
            </Link>
          </div>
        </div>
      )}
      {status === "idle" && supported && (
        <span className="text-xs text-muted">
          Needs the free PokePet app.{" "}
          <Link href={`${routes.download}?pet=${slug}`} className="underline underline-offset-4 hover:text-ink">Download it here</Link>.
        </span>
      )}
    </div>
  );
}
