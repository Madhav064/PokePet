import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "@fontsource-variable/inter";
import "@fontsource/pixelify-sans/500.css";
import "@fontsource/pixelify-sans/700.css";
import "./globals.css";
import { routes, site } from "@/lib/site";
import { getManifest } from "@/lib/packs";

export const metadata: Metadata = {
  title: { default: `${site.name} · ${site.tagline}`, template: `%s · ${site.name}` },
  description: site.description,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#16191f" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pack = await getManifest(site.defaultPack);
  return (
    <html lang="en">
      <body className="min-h-dvh flex flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-surface focus:px-3 focus:py-2 focus:rounded-lg">
          Skip to content
        </a>
        <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
          <div className="container-pp flex h-14 items-center gap-6">
            <Link href={routes.home} className="flex items-center gap-2 font-display text-xl font-bold tracking-wide">
              <span aria-hidden="true" className="inline-block size-3 bg-accent" />
              {site.name}
            </Link>
            <nav className="ml-auto flex items-center gap-5 text-sm text-muted">
              <Link href={routes.home} className="hover:text-ink">Dex</Link>
              <Link href={routes.about} className="hover:text-ink">About</Link>
            </nav>
          </div>
        </header>
        <main id="main" className="flex-1">{children}</main>
        <footer className="border-t border-line mt-16">
          <div className="container-pp py-8 text-xs text-muted flex flex-col gap-2">
            <p>
              {site.name} is a free, non-commercial fan project. It is not affiliated with or endorsed by Nintendo, Game Freak, Creatures Inc. or The Pokémon Company.
            </p>
            <p>{pack.attribution}</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
