import Image from "next/image";

import { Icons } from "@/components/common/icons";
import type { InstagramPost } from "@/config/instagram";

export function InstagramStrip({ posts }: { posts: InstagramPost[] }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {posts.map((post) => (
        <li key={post.id}>
          <a
            href={post.href}
            target="_blank"
            rel="noreferrer"
            className="group relative block aspect-square overflow-hidden rounded border border-border bg-muted"
          >
            <Image
              src={post.image}
              alt={post.caption}
              fill
              sizes="(min-width: 768px) 25vw, 50vw"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            />
            <span className="absolute inset-0 flex items-end bg-gradient-to-t from-black/75 via-black/10 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="line-clamp-2 text-xs leading-snug text-white">
                {post.caption}
              </span>
            </span>
            <Icons.arrowUpRight className="absolute right-2 top-2 h-4 w-4 text-white opacity-0 transition-opacity group-hover:opacity-100" />
          </a>
        </li>
      ))}
    </ul>
  );
}
