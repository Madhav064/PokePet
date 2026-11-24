"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** ← / → move between pets, Esc returns to the list. */
export function KeyNav({ prev, next, home }: { prev?: string; next?: string; home: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft" && prev) router.push(prev);
      if (e.key === "ArrowRight" && next) router.push(next);
      if (e.key === "Escape") router.push(home);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, home, router]);
  useEffect(() => {
    if (prev) router.prefetch(prev);
    if (next) router.prefetch(next);
  }, [prev, next, router]);
  return null;
}
