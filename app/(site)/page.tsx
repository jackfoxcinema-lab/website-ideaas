import Link from "next/link";

import { Icons } from "@/components/common/icons";
import { InstagramStrip } from "@/components/common/instagram-strip";
import { Reveal } from "@/components/common/reveal";
import { SectionHeading } from "@/components/common/section-heading";
import { TrackCard } from "@/components/music/track-card";
import { PostCard } from "@/components/writing/post-card";
import { instagramPosts } from "@/config/instagram";
import { siteConfig } from "@/config/site";
import { primarySocial } from "@/config/socials";
import { featuredTracks, sortTracks, tracks } from "@/config/tracks";
import { getFeaturedPosts } from "@/lib/posts";

export default function HomePage() {
  const posts = getFeaturedPosts(2);
  const showcase = sortTracks(
    featuredTracks.length > 0 ? featuredTracks : tracks
  ).slice(0, 2);

  const PrimaryIcon = Icons[primarySocial.icon];

  const schema = {
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      {/* ── Wordmark ─────────────────────────────────────────────── */}
      <section className="flex flex-col items-center pb-8 pt-24 text-center sm:pt-32">
        <Reveal>
          <h1 className="font-display text-[5.5rem] font-semibold lowercase leading-[0.8] tracking-[-0.045em] sm:text-[8rem]">
            {siteConfig.name}
          </h1>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-7 text-lg font-light text-muted-foreground">
            {siteConfig.tagline}
          </p>
        </Reveal>

        <Reveal delay={0.18}>
          <Link
            href="/snippets"
            className="mt-12 inline-flex items-center gap-3 border border-foreground/20 px-7 py-3 text-sm transition-colors duration-300 hover:border-accent hover:bg-accent hover:text-accent-foreground"
          >
            <Icons.play className="h-3 w-3" />
            Listen
          </Link>
        </Reveal>
      </section>

      {/* ── Snippets ─────────────────────────────────────────────── */}
      {showcase.length > 0 && (
        <Reveal as="section" delay={0.1} className="pt-32">
          <SectionHeading
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
        <Reveal as="section" delay={0.1} className="pt-32">
          <SectionHeading
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

      {/* ── Elsewhere ────────────────────────────────────────────── */}
      <Reveal as="section" delay={0.1} className="pt-32">
        <SectionHeading title="Elsewhere" />
        {instagramPosts.length > 0 ? (
          <InstagramStrip posts={instagramPosts} />
        ) : (
          <div className="panel flex flex-col items-center gap-7 px-8 py-20 text-center">
            <p className="max-w-sm text-[0.95rem] leading-relaxed text-foreground/70">
              Shorter clips and day-to-day bits go up on {primarySocial.name}{" "}
              first. Everything that survives ends up here.
            </p>
            <a
              href={primarySocial.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2.5 border border-foreground/20 bg-background/40 px-6 py-3 text-sm transition-colors duration-300 hover:border-accent hover:bg-accent hover:text-accent-foreground"
            >
              <PrimaryIcon className="h-4 w-4" />
              {primarySocial.handle}
            </a>
          </div>
        )}
      </Reveal>
    </>
  );
}
