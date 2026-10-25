"use client";

import Link from "next/link";
import { Calendar } from "lucide-react";
import { trackAddToCalendar, trackEvent } from "@/lib/analytics";
import { feedUrlFor, subscribeLinkFor } from "@/lib/subscribe-links";
import { useDetectedPlatform } from "./useDetectedPlatform";

// The one-tap subscribe button: guesses the visitor's calendar app from
// their device and links straight into that app's own subscribe flow, so
// there's a single button rather than a choice. Until the guess is in (the
// server render) or when there's nothing to guess from, it falls back to
// the /subscribe page, which walks through every option.
export default function AddToCalendarButton({
  feedParams,
  fallbackHref,
  source,
  style,
  className,
}: {
  feedParams: URLSearchParams;
  fallbackHref: string;
  source: string;
  style: React.CSSProperties;
  className?: string;
}) {
  const platform = useDetectedPlatform();
  const feedUrl = feedUrlFor(feedParams);
  const link = platform ? subscribeLinkFor(platform, feedUrl) : null;
  const filtered = feedParams.size > 0;

  if (!platform || !link) {
    return (
      <Link href={fallbackHref} onClick={() => trackEvent("subscribe_click", { source, filtered })} className={className} style={style}>
        <Calendar size={15} /> {filtered ? "Subscribe to these events" : "Subscribe to calendar"}
      </Link>
    );
  }

  return (
    <a
      href={link.href}
      target="_blank"
      rel="noreferrer"
      onClick={() => trackAddToCalendar({ method: "one_tap", platform, source, feedUrl })}
      className={className}
      style={style}
    >
      <Calendar size={15} /> {link.label}
    </a>
  );
}
