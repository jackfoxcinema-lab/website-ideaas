/**
 * Pull the 11-character video id out of whatever YouTube hands you when you
 * hit "Share" — a watch URL, a youtu.be link, an embed URL, a Short, or the
 * bare id itself. Returns null if there's nothing usable in there, which is
 * how the components decide whether to render a player at all.
 */
export function youtubeId(input: string | undefined): string | null {
  if (!input) return null;
  const value = input.trim();
  if (!value) return null;

  // Already a bare id.
  if (/^[\w-]{11}$/.test(value)) return value;

  const patterns = [
    /(?:youtube\.com|youtube-nocookie\.com)\/watch\?(?:.*&)?v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /(?:youtube\.com|youtube-nocookie\.com)\/embed\/([\w-]{11})/,
    /(?:youtube\.com|youtube-nocookie\.com)\/shorts\/([\w-]{11})/,
    /(?:youtube\.com|youtube-nocookie\.com)\/live\/([\w-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/** Canonical watch URL — used for the "open on YouTube" fallback link. */
export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/**
 * The still frame YouTube generates for every video. `hqdefault` exists for
 * every upload; `maxresdefault` doesn't, so this is the safe one to hotlink.
 */
export function youtubeThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}
