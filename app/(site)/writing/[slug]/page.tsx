import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Icons } from "@/components/common/icons";
import { Reveal } from "@/components/common/reveal";
import { AudioPlayer } from "@/components/music/audio-player";
import { siteConfig } from "@/config/site";
import { tracks } from "@/config/tracks";
import { getAllPostSlugs, getPost } from "@/lib/posts";
import { formatDate } from "@/lib/utils";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getAllPostSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Not found" };

  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/writing/${slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      publishedTime: post.date,
      url: `${siteConfig.url}/writing/${slug}`,
    },
  };
}

export default async function PostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  // A post can pin one snippet, so the thing being written about is playable
  // right there in the article.
  const track = post.track ? tracks.find((t) => t.id === post.track) : undefined;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: { "@type": "Person", name: siteConfig.authorName },
    url: `${siteConfig.url}/writing/${slug}`,
  };

  return (
    <article className="pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />

      <Reveal>
        <Link
          href="/writing"
          className="label inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
        >
          <Icons.arrowLeft className="h-3 w-3" />
          Writing
        </Link>
      </Reveal>

      <Reveal delay={0.05} as="header" className="pb-14 pt-8 text-center">
        <h1 className="mx-auto max-w-2xl font-display text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[3.25rem]">
          {post.title}
        </h1>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-b border-border pb-8">
          <time dateTime={post.date} className="label">
            {formatDate(post.date)}
          </time>
          <span className="label">{post.readingTime} min read</span>
          {post.tags?.map((tag) => (
            <span key={tag} className="label">
              {tag}
            </span>
          ))}
        </div>
      </Reveal>

      {track && (
        <Reveal delay={0.1} className="panel mb-14 px-6 py-7">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <span className="label">Listen while you read</span>
            <span className="font-display text-lg leading-none">
              {track.title}
            </span>
          </div>
          <AudioPlayer id={track.id} src={track.audio} title={track.title} />
        </Reveal>
      )}

      <Reveal delay={0.14}>
        <div
          className="prose-flore"
          dangerouslySetInnerHTML={{ __html: post.contentHtml }}
        />
      </Reveal>
    </article>
  );
}
