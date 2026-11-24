import type { CSSProperties } from "react";
import type { ElementDef } from "@pokepet/core";

export function ElementBadge({ element, size = "md" }: { element: ElementDef; size?: "sm" | "md" }) {
  return (
    <span
      className={`pp-badge pp-badge-${size}`}
      style={{ "--el": element.color } as CSSProperties}
    >
      {element.label}
    </span>
  );
}
