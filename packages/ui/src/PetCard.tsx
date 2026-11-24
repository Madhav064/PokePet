"use client";
import { useState } from "react";
import type { AtlasSpec, ElementDef, PetSummary } from "@pokepet/core";
import type { LinkComponent } from "./link.ts";
import { Sprite } from "./Sprite.tsx";
import { ElementBadge } from "./ElementBadge.tsx";

export interface PetCardProps {
  pet: PetSummary;
  atlas: AtlasSpec;
  elements: Map<string, ElementDef>;
  spriteUrl: string;
  href: string;
  Link: LinkComponent;
  numberLabel: string;
}

/** Grid card: still frame at rest, plays the idle row on hover or keyboard focus. */
export function PetCard({ pet, atlas, elements, spriteUrl, href, Link, numberLabel }: PetCardProps) {
  const [active, setActive] = useState(false);
  return (
    <div
      className="pp-card-wrap"
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      <Link href={href} className="pp-card" aria-label={`${pet.name}, ${numberLabel} ${pet.number}`}>
        <span className="pp-card-num">
          {numberLabel} {String(pet.number).padStart(3, "0")}
        </span>
        <Sprite src={spriteUrl} atlas={atlas} playing={active} scale={0.6} lazy label={pet.name} className="pp-card-sprite" />
        <span className="pp-card-name">{pet.name}</span>
        <span className="pp-card-els">
          {pet.elements.map((e) => {
            const el = elements.get(e);
            return el ? <ElementBadge key={e} element={el} size="sm" /> : null;
          })}
        </span>
      </Link>
    </div>
  );
}
