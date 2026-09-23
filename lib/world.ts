import fs from "fs";
import path from "path";

import matter from "gray-matter";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";

import type { EntryKind } from "@/config/world";

const WORLD_DIR = path.join(process.cwd(), "content/world");

export interface EntryFrontmatter {
  title: string;
  /** Which shelf it sits on in the index. See config/world.ts. */
  kind: EntryKind;
  /** ISO date, YYYY-MM-DD — when this entered the world, not when it "happens". */
  date: string;
  /** A line or two, shown in the index and in link previews. */
  description: string;
  /** Id of a track in config/tracks.ts — the song this belongs to. */
  song?: string;
  /** A YouTube link or id, if this entry has a video attached to it. */
  youtube?: string;
  /** Image under /public/world. */
  image?: string;
  tags?: string[];
  /** Manual position within a kind. Lower first; unset sorts after by date. */
  order?: number;
  /** Pinned to the home page. */
  featured?: boolean;
}

export interface EntryMeta extends EntryFrontmatter {
  slug: string;
}

export interface Entry extends EntryMeta {
  contentHtml: string;
  /** Other entries in the same song, or failing that the same kind. */
  neighbours: EntryMeta[];
}

function readEntryFiles(): string[] {
  if (!fs.existsSync(WORLD_DIR)) return [];
  return fs.readdirSync(WORLD_DIR).filter(
    (f) =>
      f.endsWith(".md") &&
      // "_" prefixes a draft; the folder's own README isn't an entry.
      !f.startsWith("_") &&
      f.toLowerCase() !== "readme.md"
  );
}

export function getAllEntrySlugs(): string[] {
  return readEntryFiles().map((f) => f.replace(/\.md$/, ""));
}

/**
 * All entries. Sorted by `order` where it's set, then newest first — so you
 * can hand-place the spine of the world and let everything else fall in
 * behind it by date.
 */
export function getAllEntries(): EntryMeta[] {
  const entries = readEntryFiles().map((file) => {
    const raw = fs.readFileSync(path.join(WORLD_DIR, file), "utf8");
    const { data } = matter(raw);
    return {
      slug: file.replace(/\.md$/, ""),
      ...(data as EntryFrontmatter),
    } satisfies EntryMeta;
  });

  return entries.sort(compareEntries);
}

function compareEntries(a: EntryMeta, b: EntryMeta): number {
  const aOrder = a.order ?? Number.POSITIVE_INFINITY;
  const bOrder = b.order ?? Number.POSITIVE_INFINITY;
  if (aOrder !== bOrder) return aOrder - bOrder;
  return new Date(b.date).getTime() - new Date(a.date).getTime();
}

/** Entries grouped by kind, in the order config/world.ts lists the kinds. */
export function getEntriesByKind(): { kind: string; entries: EntryMeta[] }[] {
  const all = getAllEntries();
  const groups = new Map<string, EntryMeta[]>();

  for (const entry of all) {
    const key = entry.kind ?? "fragment";
    const bucket = groups.get(key);
    if (bucket) bucket.push(entry);
    else groups.set(key, [entry]);
  }

  return [...groups.entries()].map(([kind, entries]) => ({ kind, entries }));
}

/** Everything attached to one track id — used on the songs page. */
export function getEntriesForSong(songId: string): EntryMeta[] {
  return getAllEntries().filter((entry) => entry.song === songId);
}

export function getFeaturedEntries(count = 3): EntryMeta[] {
  const all = getAllEntries();
  const featured = all.filter((e) => e.featured);
  return (featured.length > 0 ? featured : all).slice(0, count);
}

export async function getEntry(slug: string): Promise<Entry | null> {
  const filePath = path.join(WORLD_DIR, `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  const frontmatter = data as EntryFrontmatter;

  const processed = await remark()
    .use(remarkGfm)
    .use(remarkHtml, { sanitize: false })
    .process(content);

  // Every entry needs a door out of it — a world is only a world if you can
  // keep walking. Entries in the same song come first because that's the
  // strongest link, then the same kind, then whatever's newest, so even the
  // first entry in a brand-new world has somewhere to go.
  const others = getAllEntries().filter((e) => e.slug !== slug);
  const sameSong = frontmatter.song
    ? others.filter((e) => e.song === frontmatter.song)
    : [];
  const sameKind = others.filter(
    (e) => e.kind === frontmatter.kind && !sameSong.includes(e)
  );
  const rest = others.filter(
    (e) => !sameSong.includes(e) && !sameKind.includes(e)
  );
  const neighbours = [...sameSong, ...sameKind, ...rest].slice(0, 3);

  return {
    slug,
    contentHtml: processed.toString(),
    neighbours,
    ...frontmatter,
  };
}
