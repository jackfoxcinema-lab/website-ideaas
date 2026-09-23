import Link from "next/link";

import { Icons } from "@/components/common/icons";
import { Reveal } from "@/components/common/reveal";
import { SectionHeading } from "@/components/common/section-heading";
import { TrackCard } from "@/components/music/track-card";
import { PostCard } from "@/components/writing/post-card";
import { instagramPosts } from "@/config/instagram";
import { siteConfig } from "@/config/site";
import { primarySocial } from "@/config/socials";
import { featuredTracks, sortTracks, tracks } from "@/config/tracks";
import { getFeaturedPosts } from "@/lib/posts";
import { InstagramStrip } from "@/components/common/instagram-strip";

export default function HomePage() {
  const posts = getFeaturedPosts(3);
  const showcase = sortTracks(
    featuredTracks.length > 0 ? featuredTracks : tracks
  ).slice(0, 2);

  const PrimaryIcon = Icons[primarySocial.icon];

  const personSchema = {
    "@context": "https://schema.org",
    "@type": "MusicGroup",
    name: siteConfig.name,
    url: siteConfig.url,
    description: siteConfig.description,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }}
      />

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="flex min-h-[62vh] flex-col justify-center pb-20 pt-6">
        <Reveal className="label mb-6 block">{siteConfig.tagline}</Reveal>

        <Reveal delay={0.06}>
          <h1 className="font-display text-[4rem] font-normal leading-[0.85] tracking-[-0.02em] sm:text-[7rem] md:text-[9rem]">
            {siteConfig.name}
          </h1>
        </Reveal>

        <Reveal delay={0.14}>
          <p className="mt-8 max-w-lg text-lg leading-relaxed text-muted-foreground">
            Half-finished songs, voice memos, and the notes I keep while
            making them. Nothing here is polished — that&apos;s the point.
          </p>
        </Reveal>

        <Reveal
          delay={0.22}
          className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3"
        >
          <Link
            href="/snippets"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-85"
          >
            <Icons.play className="h-3.5 w-3.5" />
            Listen
          </Link>
          <a
            href={primarySocial.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:border-accent"
          >
            <PrimaryIcon className="h-3.5 w-3.5" />
            {primarySocial.handle}
          </a>
        </Reveal>
      </section>

      {/* ── Latest snippets ──────────────────────────────────────── */}
      {showcase.length > 0 && (
        <Reveal as="section" delay={0.1} className="max-w-3xl py-16">
          <SectionHeading
            eyebrow="Latest"
            title="Snippets"
            href="/snippets"
            linkLabel="All snippets"
          />
          <div className="flex flex-col">
            {showcase.map((track) => (
              <TrackCard key={track.id} track={track} />
            ))}
          </div>
        </Reveal>
      )}

      {/* ── Writing ──────────────────────────────────────────────── */}
      {posts.length > 0 && (
        <Reveal as="section" delay={0.1} className="max-w-3xl py-16">
          <SectionHeading
            eyebrow="Notes"
            title="Writing"
            href="/writing"
            linkLabel="All writing"
          />
          <div className="flex flex-col">
            {posts.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        </Reveal>
      )}

      {/* ── Instagram ────────────────────────────────────────────── */}
      <Reveal as="section" delay={0.1} className="max-w-3xl py-16">
        <SectionHeading eyebrow="Elsewhere" title={primarySocial.name} />
        {instagramPosts.length > 0 ? (
          <InstagramStrip posts={instagramPosts} />
        ) : (
          <div className="flex flex-col items-start gap-5 rounded border border-dashed border-border p-8">
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              Shorter clips and day-to-day bits go up on{" "}
              {primarySocial.name} first. Everything that survives ends up
              here.
            </p>
            <a
              href={primarySocial.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium transition-colors hover:text-accent"
            >
              <PrimaryIcon className="h-4 w-4" />
              {primarySocial.handle}
              <Icons.arrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
      </Reveal>
    </>
  );
}
