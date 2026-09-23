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
    <div className="max-w-3xl pb-12">
      <PageHeader
        eyebrow={`${posts.length} ${posts.length === 1 ? "entry" : "entries"}`}
        title="Writing"
        description="Notes on how the songs come together, what I'm listening to, and the parts that don't make it."
      />

      {posts.length === 0 ? (
        <p className="border-t border-border py-16 text-sm text-muted-foreground">
          Nothing written yet.
        </p>
      ) : (
        <div className="flex flex-col border-t border-border pt-7">
          {posts.map((post, i) => (
            <Reveal key={post.slug} delay={Math.min(i * 0.05, 0.3)}>
              <PostCard post={post} />
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
