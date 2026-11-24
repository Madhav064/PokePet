/** Brand and routing config in one place, so renaming the product is a one-file change. */
export const site = {
  name: "PokePet",
  tagline: "Pixel pets for your screen",
  description: "Browse animated pixel pets, their stats and evolutions. Desktop pets coming soon.",
  defaultPack: "pokemon",
} as const;

export const routes = {
  home: "/",
  pet: (slug: string) => `/pet/${slug}`,
  about: "/about",
};

export const spriteUrl = (packId: string, slug: string) => `/packs/${packId}/pets/${slug}/spritesheet.webp`;
