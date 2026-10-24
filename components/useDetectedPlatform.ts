"use client";

import { useSyncExternalStore } from "react";
import { detectPlatform, type Platform } from "@/lib/subscribe-links";

const noopSubscribe = () => () => {};

// navigator only exists in the browser, so the server snapshot is null and
// the guess appears after hydration without a server/client mismatch.
export function useDetectedPlatform(): Platform | null {
  return useSyncExternalStore(noopSubscribe, () => detectPlatform(navigator.userAgent), () => null);
}
