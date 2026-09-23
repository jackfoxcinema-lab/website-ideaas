import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { Reveal } from "@/components/common/reveal";
import { PostCard } from "@/components/writing/post-card";
import { siteConfig } from "@/config/site";
import { getAllPosts } from "@/lib/posts";

export const metadata: Metadata = {
  title: "Writing",
  description: `Notes on songwriting, recording and everything around it — by ${siteConfig.name}.`,
  alternates: { canonical: "/writing" },
};

export default function WritingPage() {
  const posts = getAllPosts();

  return (
    <>
      <PageHeader
        eyebrow={`${posts.length} ${posts.length === 1 ? "entry" : "entries"}`}
        title="Writing"
        description="Notes on how the songs come together, what I'm listening to, and the parts that don't make it."
      />

      {posts.length === 0 ? (
        <p className="py-24 text-center text-sm text-muted-foreground">
          Nothing written yet.
        </p>
      ) : (
        <div className="flex flex-col pb-8">
          {posts.map((post, i) => (
            <Reveal key={post.slug} delay={Math.min(i * 0.05, 0.3)}>
              <PostCard post={post} />
            </Reveal>
          ))}
        </div>
      )}
    </>
  );
}
