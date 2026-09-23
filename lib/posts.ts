import fs from "fs";
import path from "path";

import matter from "gray-matter";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";

const POSTS_DIR = path.join(process.cwd(), "content/writing");

export interface PostFrontmatter {
  title: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  description: string;
  tags?: string[];
  /** Slug of a track in config/tracks.ts to embed a player under the intro. */
  track?: string;
  featured?: boolean;
}

export interface PostMeta extends PostFrontmatter {
  slug: string;
  readingTime: number;
}

export interface Post extends PostMeta {
  contentHtml: string;
}

function readPostFiles(): string[] {
  if (!fs.existsSync(POSTS_DIR)) return [];
  return fs.readdirSync(POSTS_DIR).filter(
    (f) =>
      f.endsWith(".md") &&
      // Skip the folder's own README and anything prefixed with "_",
      // which is how drafts stay out of the published list.
      !f.startsWith("_") &&
      f.toLowerCase() !== "readme.md"
  );
}

function estimateReadingTime(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

export function getAllPostSlugs(): string[] {
  return readPostFiles().map((f) => f.replace(/\.md$/, ""));
}

/** All posts, newest first, metadata only. */
export function getAllPosts(): PostMeta[] {
  const posts = readPostFiles().map((file) => {
    const raw = fs.readFileSync(path.join(POSTS_DIR, file), "utf8");
    const { data, content } = matter(raw);
    return {
      slug: file.replace(/\.md$/, ""),
      readingTime: estimateReadingTime(content),
      ...(data as PostFrontmatter),
    } satisfies PostMeta;
  });

  return posts.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export async function getPost(slug: string): Promise<Post | null> {
  const filePath = path.join(POSTS_DIR, `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);

  const processed = await remark()
    .use(remarkGfm)
    .use(remarkHtml, { sanitize: false })
    .process(content);

  return {
    slug,
    readingTime: estimateReadingTime(content),
    contentHtml: processed.toString(),
    ...(data as PostFrontmatter),
  };
}

/** Featured posts, falling back to the latest few. */
export function getFeaturedPosts(count = 3): PostMeta[] {
  const all = getAllPosts();
  const featured = all.filter((p) => p.featured);
  return (featured.length > 0 ? featured : all).slice(0, count);
}
