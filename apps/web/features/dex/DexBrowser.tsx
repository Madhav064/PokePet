"use client";
import type { PackManifest, PetSummary } from "@pokepet/core";
import { DexBrowser as SharedDexBrowser } from "@pokepet/ui";
import { AppLink } from "@/lib/AppLink";
import { routes, spriteUrl } from "@/lib/site";

/** Website wrapper: Next.js links, pet pages as targets, filters mirrored in the URL. */
export function DexBrowser({ pack, pets }: { pack: PackManifest; pets: PetSummary[] }) {
  return (
    <SharedDexBrowser
      pack={pack}
      pets={pets}
      spriteUrl={(slug) => spriteUrl(pack.id, slug)}
      hrefFor={routes.pet}
      Link={AppLink}
      syncUrl
    />
  );
}
