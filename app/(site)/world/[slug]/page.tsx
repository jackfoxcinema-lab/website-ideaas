import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Icons } from "@/components/common/icons";
import { Reveal } from "@/components/common/reveal";
import { AudioPlayer } from "@/components/music/audio-player";
import { YouTubeEmbed, YouTubeLink } from "@/components/music/youtube-embed";
import { EntryCard } from "@/components/world/entry-card";
import { siteConfig } from "@/config/site";
import { tracks } from "@/config/tracks";
import { entryKindLabels } from "@/config/world";
import { getAllEntrySlugs, getEntry } from "@/lib/world";
import { formatDate } from "@/lib/utils";
import { youtubeId } from "@/lib/youtube";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getAllEntrySlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const entry = await getEntry(slug);
  if (!entry) return { title: "Not found" };

  return {
    title: entry.title,
    description: entry.description,
    alternates: { canonical: `/world/${slug}` },
    openGraph: {
      type: "article",
      title: entry.title,
      description: entry.description,
      url: `${siteConfig.url}/world/${slug}`,
      ...(entry.image ? { images: [entry.image] } : {}),
    },
  };
}

export default async function EntryPage({ params }: PageProps) {
  const { slug } = await params;
  const entry = await getEntry(slug);
  if (!entry) notFound();

  // The song this belongs to, so you can hear the thing you're reading about.
  const track = entry.song
    ? tracks.find((t) => t.id === entry.song)
    : undefined;
  // An entry can carry its own video — a sit-down, a visualiser, a scene.
  const entryVideo = youtubeId(entry.youtube);
  const trackVideo = youtubeId(track?.youtube);

  return (
    <article className="pb-16">
      <Reveal>
        <Link
          href="/world"
          className="label inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
        >
          <Icons.arrowLeft className="h-3 w-3" />
          World
        </Link>
      </Reveal>

      <Reveal delay={0.05} as="header" className="pb-14 pt-8 text-center">
        <span className="label">
          {entryKindLabels[entry.kind] ?? entry.kind}
        </span>
        <h1 className="mx-auto mt-6 max-w-2xl font-display text-4xl font-semibold lowercase leading-[1.05] tracking-[-0.03em] sm:text-[3.25rem]">
          {entry.title}
        </h1>
        <p className="mx-auto mt-7 max-w-md text-[0.95rem] leading-relaxed text-muted-foreground">
          {entry.description}
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-b border-border pb-8">
          <time dateTime={entry.date} className="label">
            {formatDate(entry.date)}
          </time>
          {entry.tags?.map((tag) => (
            <span key={tag} className="label">
              {tag}
            </span>
          ))}
        </div>
      </Reveal>

      {entry.image && (
        <Reveal
          delay={0.08}
          className="relative mb-14 aspect-[3/2] w-full overflow-hidden border border-border bg-muted"
        >
          <Image
            src={entry.image}
            alt=""
            fill
            sizes="(min-width: 768px) 48rem, 100vw"
            className="object-cover"
            priority
          />
        </Reveal>
      )}

      {entryVideo && (
        <Reveal delay={0.1} className="mb-14">
          <YouTubeEmbed id={entryVideo} title={entry.title} />
        </Reveal>
      )}

      {track && (
        <Reveal delay={0.12} className="panel mb-14 px-6 py-7">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <span className="label">From the song</span>
            <span className="font-display text-lg lowercase leading-none">
              {track.title}
            </span>
          </div>
          {trackVideo ? (
            <div className="flex flex-col gap-3">
              <YouTubeEmbed id={trackVideo} title={track.title} />
              <YouTubeLink id={trackVideo} />
            </div>
          ) : (
            <AudioPlayer id={track.id} src={track.audio} title={track.title} />
          )}
        </Reveal>
      )}

      <Reveal delay={0.14}>
        <div
          className="prose-flore"
          dangerouslySetInnerHTML={{ __html: entry.contentHtml }}
        />
      </Reveal>

      {entry.neighbours.length > 0 && (
        <Reveal
          delay={0.16}
          as="section"
          className="mt-24 border-t border-border pt-10"
        >
          <span className="label">Nearby</span>
          <div className="mt-4 flex flex-col">
            {entry.neighbours.map((neighbour) => (
              <EntryCard key={neighbour.slug} entry={neighbour} />
            ))}
          </div>
        </Reveal>
      )}
    </article>
  );
}
