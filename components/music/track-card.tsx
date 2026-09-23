import Image from "next/image";

import { Icons } from "@/components/common/icons";
import { AudioPlayer } from "@/components/music/audio-player";
import { stageLabels, type Track } from "@/config/tracks";
import { cn, formatDateShort } from "@/lib/utils";

interface TrackCardProps {
  track: Track;
  className?: string;
}

export function TrackCard({ track, className }: TrackCardProps) {
  return (
    <article
      className={cn(
        "group relative flex flex-col gap-4 border-b border-border py-7 first:pt-0 last:border-b-0",
        className
      )}
    >
      <div className="flex items-start gap-4">
        {track.cover && (
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded border border-border bg-muted sm:h-20 sm:w-20">
            <Image
              src={track.cover}
              alt=""
              fill
              sizes="80px"
              className="object-cover"
            />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="font-display text-2xl font-normal leading-none tracking-tight sm:text-[1.75rem]">
              {track.title}
            </h3>
            <span className="label border border-border px-1.5 py-0.5 leading-none text-muted-foreground">
              {stageLabels[track.stage]}
            </span>
            <time
              dateTime={track.date}
              className="label ml-auto shrink-0 tabular-nums"
            >
              {formatDateShort(track.date)}
            </time>
          </div>

          {track.lyric && (
            <p className="mt-3 font-display text-lg italic leading-snug text-foreground/75">
              &ldquo;{track.lyric}&rdquo;
            </p>
          )}

          {track.note && (
            <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
              {track.note}
            </p>
          )}
        </div>
      </div>

      <AudioPlayer id={track.id} src={track.audio} title={track.title} />

      {(track.tags?.length || track.links?.length) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {track.tags?.map((tag) => (
            <span key={tag} className="label">
              {tag}
            </span>
          ))}
          {track.links?.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="label inline-flex items-center gap-1 text-foreground transition-opacity hover:opacity-60"
            >
              {link.label}
              <Icons.arrowUpRight className="h-3 w-3" />
            </a>
          ))}
        </div>
      )}
    </article>
  );
}
