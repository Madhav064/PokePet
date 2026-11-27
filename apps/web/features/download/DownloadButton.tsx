"use client";
import { useEffect, useState } from "react";
import { androidDownloadUrl, downloadUrlFor } from "@/lib/site";
import { readPending, savePending } from "@/lib/pending";
import { usePlatform } from "@/lib/platform";

const primary = "h-12 px-6 rounded-xl bg-accent text-white font-semibold inline-flex items-center hover:brightness-95";
const secondary = "h-12 px-6 rounded-xl border border-line bg-surface font-semibold inline-flex items-center hover:border-ink/30";

/**
 * The Download page's buttons, with the visitor's own platform first. If they came here
 * while adopting a pet (?pet=… or remembered in this browser), the Windows download
 * carries that pet, so the app adopts it as soon as it's installed. Android can't carry it
 * in the file, so the site remembers it and offers to finish adopting after the install.
 */
export function DownloadButton({ names }: { names: Record<string, string> }) {
  const [pet, setPet] = useState<{ slug: string; name: string } | null>(null);
  const platform = usePlatform();

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("pet");
    if (fromUrl && names[fromUrl]) return setPet({ slug: fromUrl, name: names[fromUrl] });
    const pending = readPending();
    if (pending) setPet({ slug: pending.slug, name: pending.name });
  }, [names]);

  const remember = () => pet && savePending(pet.slug, pet.name);
  const windows = (
    <a key="windows" href={downloadUrlFor(pet?.slug)} referrerPolicy="unsafe-url" onClick={remember}
      className={platform === "android" ? secondary : primary}>
      Download for Windows
    </a>
  );
  const android = (
    <a key="android" href={androidDownloadUrl} onClick={remember} className={platform === "android" ? primary : secondary}>
      Download for Android
    </a>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">{platform === "android" ? [android, windows] : [windows, android]}</div>
      <span className="text-sm text-muted">Free · Windows 10 and 11 (64-bit) · Android 7 and newer (64-bit)</span>
      {pet && (
        <span className="text-sm">
          {platform === "android" ? (
            <>After installing, come back to this page to finish adopting <strong>{pet.name}</strong>.</>
          ) : (
            <><strong>{pet.name}</strong> will be waiting on your screen when PokePet opens.</>
          )}
        </span>
      )}
    </div>
  );
}
