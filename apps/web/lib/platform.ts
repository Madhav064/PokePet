"use client";
import { useEffect, useState } from "react";

/** Where the visitor is browsing from, as far as getting the PokePet app goes. */
export type Platform = "windows" | "android" | "other";

export function detectPlatform(userAgent: string): Platform {
  if (/Android/i.test(userAgent)) return "android";
  if (/Windows/i.test(userAgent)) return "windows";
  return "other";
}

/**
 * The visitor's platform. It's "windows" during the server render and first paint (most
 * visitors), then switches once the browser tells us otherwise.
 */
export function usePlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>("windows");
  useEffect(() => setPlatform(detectPlatform(navigator.userAgent)), []);
  return platform;
}
