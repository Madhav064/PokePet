"use client";
import { useEffect, useState } from "react";
import { adoptLink } from "@/lib/site";
import { clearPending, readPending, type PendingAdoption } from "@/lib/pending";

/**
 * Shown on every page after a visitor downloaded the app to adopt a pet. Normally the app
 * adopts it by itself on first launch; this is the fallback when that couldn't happen.
 */
export function PendingBanner() {
  const [pending, setPending] = useState<PendingAdoption | null>(null);

  useEffect(() => {
    const sync = () => setPending(readPending());
    sync();
    window.addEventListener("pp-pending-change", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("pp-pending-change", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  if (!pending) return null;

  return (
    <div className="border-b border-line bg-surface" role="region" aria-label="Finish adopting">
      <div className="container-pp flex flex-wrap items-center gap-3 py-2.5 text-sm">
        <span>
          Installed PokePet? Finish adopting <strong>{pending.name}</strong>.
        </span>
        <a
          href={adoptLink(pending.slug)}
          onClick={() => clearPending()}
          className="h-8 px-3 rounded-lg bg-accent text-white font-semibold inline-flex items-center hover:brightness-95"
        >
          Adopt {pending.name}
        </a>
        <button type="button" onClick={() => clearPending()} className="ml-auto text-muted hover:text-ink">
          Dismiss
        </button>
      </div>
    </div>
  );
}
