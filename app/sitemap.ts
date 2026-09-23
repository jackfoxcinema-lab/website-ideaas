import type { MetadataRoute } from "next";

// Emitted as a file at build time; required for `output: export`.
export const dynamic = "force-static";

import { siteConfig } from "@/config/site";
import { getAllPosts } from "@/lib/posts";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/snippets", "/writing", "/about"].map((route) => ({
    url: `${siteConfig.url}${route}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: route === "" ? 1 : 0.8,
  }));

  const posts = getAllPosts().map((post) => ({
    url: `${siteConfig.url}/writing/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...routes, ...posts];
}
