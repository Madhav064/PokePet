"use client";
import { useEffect, useState } from "react";
import { downloadUrlFor } from "@/lib/site";
import { readPending, savePending } from "@/lib/pending";

/**
 * The Download page's main button. If the visitor came here while adopting a pet
 * (?pet=… or remembered in this browser), the download carries that pet, so the
 * app adopts it as soon as it's installed.
 */
export function DownloadButton({ names }: { names: Record<string, string> }) {
  const [pet, setPet] = useState<{ slug: string; name: string } | null>(null);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("pet");
    if (fromUrl && names[fromUrl]) return setPet({ slug: fromUrl, name: names[fromUrl] });
    const pending = readPending();
    if (pending) setPet({ slug: pending.slug, name: pending.name });
  }, [names]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-4">
        <a
          href={downloadUrlFor(pet?.slug)}
          referrerPolicy="unsafe-url"
          onClick={() => pet && savePending(pet.slug, pet.name)}
          className="h-12 px-6 rounded-xl bg-accent text-white font-semibold inline-flex items-center hover:brightness-95"
        >
          Download for Windows
        </a>
        <span className="text-sm text-muted">Free · Windows 10 and 11 (64-bit)</span>
      </div>
      {pet && (
        <span className="text-sm">
          <strong>{pet.name}</strong> will be waiting on your screen when PokePet opens.
        </span>
      )}
    </div>
  );
}
