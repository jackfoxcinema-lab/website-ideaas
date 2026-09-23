import Link from "next/link";

import { Icons } from "@/components/common/icons";
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
        "group flex flex-col gap-2 border-b border-border py-7 first:pt-0 last:border-b-0",
        className
      )}
    >
      <div className="flex items-baseline gap-3">
        <time dateTime={post.date} className="label shrink-0 tabular-nums">
          {formatDateShort(post.date)}
        </time>
        <span className="label ml-auto shrink-0">
          {post.readingTime} min
        </span>
      </div>

      <h3 className="font-display text-2xl font-normal leading-tight tracking-tight transition-colors group-hover:text-accent sm:text-3xl">
        {post.title}
      </h3>

      <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
        {post.description}
      </p>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
        {post.tags?.map((tag) => (
          <span key={tag} className="label">
            {tag}
          </span>
        ))}
        <span className="label ml-auto inline-flex items-center gap-1 text-foreground opacity-0 transition-opacity group-hover:opacity-100">
          Read
          <Icons.arrowUpRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}
