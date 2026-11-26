/** Brand and routing config in one place, so renaming the product is a one-file change. */
export const site = {
  name: "PokePet",
  tagline: "Pixel pets for your screen",
  description: "Animated pixel pets that live on your desktop and evolve the longer they stay. Free for Windows.",
  defaultPack: "pokemon",
} as const;

export const routes = {
  home: "/",
  pet: (slug: string) => `/pet/${slug}`,
  about: "/about",
  download: "/download",
};

export const spriteUrl = (packId: string, slug: string) => `/packs/${packId}/pets/${slug}/spritesheet.webp`;

/**
 * The Windows installer. The release workflow (.github/workflows/release-desktop.yml)
 * always uploads it under this name, so this link points at the newest version.
 */
export const downloadUrl = "https://github.com/Madhav064/PokePet/releases/latest/download/PokePet-Setup.exe";

/**
 * Download link that remembers the pet the visitor picked. Browsers record where a
 * download came from (including this ?pet= and the page it was clicked on) on the
 * installer file, and the app reads it on first launch to adopt that pet straight away.
 * Use it with referrerPolicy="unsafe-url" so the full page address is recorded too.
 */
export const downloadUrlFor = (slug?: string | null) => (slug ? `${downloadUrl}?pet=${encodeURIComponent(slug)}` : downloadUrl);

/** Opens the desktop app and adopts the pet (handled by the app's pokepet:// link). */
export const adoptLink = (slug: string) => `pokepet://adopt/${slug}`;
