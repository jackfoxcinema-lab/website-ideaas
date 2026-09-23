import Image from "next/image";
import Link from "next/link";

import { Icons } from "@/components/common/icons";
import { AudioPlayer } from "@/components/music/audio-player";
import { YouTubeEmbed, YouTubeLink } from "@/components/music/youtube-embed";
import { stageLabels, type Track } from "@/config/tracks";
import type { EntryMeta } from "@/lib/world";
import { cn, formatDateShort } from "@/lib/utils";
import { youtubeId } from "@/lib/youtube";

interface TrackCardProps {
  track: Track;
  /** World entries that name this track, listed under the player. */
  entries?: EntryMeta[];
  className?: string;
}

export function TrackCard({ track, entries = [], className }: TrackCardProps) {
  const video = youtubeId(track.youtube);

  return (
    <article
      className={cn(
        "group border-b border-border py-12 first:pt-0 last:border-b-0",
        className
      )}
    >
      {/* Stage and date sit above the title as quiet metadata. */}
      <div className="mb-5 flex items-center gap-4">
        <span className="label bg-sage/20 px-2.5 py-1 leading-none text-foreground/70">
          {stageLabels[track.stage]}
        </span>
        <span className="h-px flex-1 bg-border" />
        <time dateTime={track.date} className="label tabular-nums">
          {formatDateShort(track.date)}
        </time>
      </div>

      <div className="flex items-start gap-6">
        {track.cover && (
          <div className="relative hidden h-24 w-24 shrink-0 overflow-hidden border border-border bg-muted sm:block">
            <Image
              src={track.cover}
              alt=""
              fill
              sizes="96px"
              className="object-cover"
            />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="font-display text-3xl font-semibold lowercase leading-none tracking-[-0.02em] sm:text-[2.5rem]">
            {track.title}
          </h3>

          {track.lyric && (
            <p className="mt-5 max-w-xl text-lg font-light italic leading-snug text-foreground/60">
              {track.lyric}
            </p>
          )}

          {track.note && (
            <p className="mt-5 max-w-prose text-[0.95rem] leading-relaxed text-muted-foreground">
              {track.note}
            </p>
          )}
        </div>
      </div>

      {/*
       * A song that's up on the channel plays as a video; everything else
       * falls back to the waveform player, which handles an empty src by
       * showing "audio coming soon".
       */}
      {video ? (
        <div className="mt-8">
          <YouTubeEmbed id={video} title={track.title} />
        </div>
      ) : (
        <AudioPlayer
          id={track.id}
          src={track.audio}
          title={track.title}
          className="mt-8"
        />
      )}

      {entries.length > 0 && (
        <div className="mt-8 border-l-2 border-sage/40 pl-5">
          <span className="label">In the world</span>
          <ul className="mt-3 flex flex-col gap-1.5">
            {entries.map((entry) => (
              <li key={entry.slug}>
                <Link
                  href={`/world/${entry.slug}`}
                  className="font-display text-lg lowercase leading-tight transition-colors hover:text-accent"
                >
                  {entry.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(track.tags?.length || track.links?.length || video) && (
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
          {track.tags?.map((tag) => (
            <span key={tag} className="label">
              {tag}
            </span>
          ))}
          {video && <YouTubeLink id={video} />}
          {track.links?.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="label inline-flex items-center gap-1.5 text-foreground transition-opacity hover:opacity-60"
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
