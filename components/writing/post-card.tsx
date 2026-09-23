import Link from "next/link";

import type { PostMeta } from "@/lib/posts";
import { cn, formatDateShort } from "@/lib/utils";

interface PostCardProps {
  post: PostMeta;
  className?: string;
}

export function PostCard({ post, className }: PostCardProps) {
  return (
    <Link
      href={`/writing/${post.slug}`}
      className={cn(
        "group block border-b border-border py-12 first:pt-0 last:border-b-0",
        className
      )}
    >
      <div className="mb-5 flex items-center gap-4">
        <time dateTime={post.date} className="label tabular-nums">
          {formatDateShort(post.date)}
        </time>
        <span className="h-px flex-1 bg-border" />
        <span className="label">{post.readingTime} min</span>
      </div>

      <h3 className="max-w-2xl font-display text-3xl font-semibold leading-[1.05] tracking-[-0.02em] transition-colors group-hover:text-accent sm:text-[2.25rem]">
        {post.title}
      </h3>

      <p className="mt-5 max-w-prose text-[0.95rem] leading-relaxed text-muted-foreground">
        {post.description}
      </p>

      {post.tags?.length ? (
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
          {post.tags.map((tag) => (
            <span key={tag} className="label">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </Link>
  );
}
