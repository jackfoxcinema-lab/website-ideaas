"use client";

import * as React from "react";

import { Icons } from "@/components/common/icons";
import { cn } from "@/lib/utils";
import { youtubeThumbnail, youtubeWatchUrl } from "@/lib/youtube";

interface YouTubeEmbedProps {
  /** An 11-character YouTube video id. */
  id: string;
  /** Used for the iframe title and the thumbnail alt text. */
  title: string;
  className?: string;
}

/**
 * A click-to-load facade rather than a live iframe.
 *
 * Embedding YouTube directly pulls in roughly a megabyte of their player and
 * sets cookies on page load, for every video on the page, whether or not
 * anyone presses play. This shows the video's own still frame and only swaps
 * in the real iframe on click — one network hop later than a raw embed, and
 * nothing at all until someone actually wants to watch.
 *
 * The iframe points at youtube-nocookie.com, which skips the tracking cookies
 * until playback starts.
 */
export function YouTubeEmbed({ id, title, className }: YouTubeEmbedProps) {
  const [active, setActive] = React.useState(false);

  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden border border-border bg-muted",
        className
      )}
    >
      {active ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      ) : (
        <button
          type="button"
          onClick={() => setActive(true)}
          aria-label={`Play ${title} on YouTube`}
          className="group absolute inset-0 h-full w-full"
        >
          {/*
           * A plain <img>, not next/image: these are hotlinked from YouTube's
           * CDN, and the static export has no image optimiser to run them
           * through.
           */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={youtubeThumbnail(id)}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full scale-[1.35] object-cover transition-transform duration-500 group-hover:scale-[1.4]"
          />
          {/* The still frames are busy; this keeps the button readable. */}
          <span className="absolute inset-0 bg-ink/25 transition-colors duration-300 group-hover:bg-ink/40" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full border border-cream/60 bg-ink/40 backdrop-blur-sm transition-colors duration-300 group-hover:border-accent group-hover:bg-accent">
              <Icons.play className="ml-0.5 h-5 w-5 text-cream transition-colors group-hover:text-accent-foreground" />
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

/** A quiet text link out to YouTube, for under an embed. */
export function YouTubeLink({
  id,
  label = "Watch on YouTube",
}: {
  id: string;
  label?: string;
}) {
  return (
    <a
      href={youtubeWatchUrl(id)}
      target="_blank"
      rel="noreferrer"
      className="label inline-flex items-center gap-1.5 text-foreground transition-opacity hover:opacity-60"
    >
      {label}
      <Icons.arrowUpRight className="h-3 w-3" />
    </a>
  );
}
