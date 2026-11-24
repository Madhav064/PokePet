import type { ComponentType, ReactNode } from "react";

/** Apps inject their router's link (Next.js Link, a plain <a>, a native pressable). */
export type LinkComponent = ComponentType<{ href: string; className?: string; children: ReactNode; "aria-label"?: string }>;
