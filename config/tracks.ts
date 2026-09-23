export type TrackStage = "snippet" | "demo" | "unreleased" | "released";

export interface Track {
  /** URL-safe id, also used to seed the waveform so it stays stable. */
  id: string;
  title: string;
  stage: TrackStage;
  /** ISO date (YYYY-MM-DD). Used for sorting, newest first. */
  date: string;
  /**
   * The song on YouTube — paste the whole link from the Share button, or
   * just the video id. This is the main player for anything that's up on the
   * channel; leave it empty for things that only exist as a file.
   */
  youtube?: string;
  /**
   * Audio file under /public/audio. Drop an mp3/m4a/wav in there and point
   * at it here. Used when there's no `youtube` link — voice memos, snippets,
   * anything not worth a video yet. Leave both empty and the card renders
   * without a player.
   */
  audio: string;
  /** Square-ish artwork under /public/tracks. Optional. */
  cover?: string;
  /** A line or two of context — what it is, where it came from. */
  note?: string;
  /** A few words of the lyric, shown in quotes under the title. */
  lyric?: string;
  /** Free-form tags: instruments, mood, session name. */
  tags?: string[];
  /** Optional outbound links for this specific track. */
  links?: { label: string; href: string }[];
  /** Pinned to the home page. */
  featured?: boolean;
}

/**
 * The songs, newest first — though it sorts by date anyway, so the order in
 * here doesn't matter.
 *
 * The YouTube ids are real. The titles, dates and order are NOT — they're
 * placeholders in the order the links were pasted. Fix:
 *
 *   title:  what the song is actually called
 *   date:   YYYY-MM-DD it went up (this is what orders the page)
 *   stage:  "released" for anything public, "unreleased" for anything not
 *
 * `id` seeds nothing visible now that these play from YouTube, but world
 * entries point at it (content/world/*.md, the `song:` field), so changing
 * an id means updating any entry that names it.
 */
export const tracks: Track[] = [
  {
    id: "song-one",
    title: "first song", // TODO: real title
    stage: "released",
    date: "2026-09-14", // TODO: real date
    youtube: "https://youtu.be/sIiM4v-H8oM",
    audio: "",
    featured: true,
  },
  {
    id: "song-two",
    title: "second song", // TODO: real title
    stage: "released",
    date: "2026-08-30", // TODO: real date
    youtube: "https://youtu.be/zbntTakEjM8",
    audio: "",
    featured: true,
  },
  {
    id: "song-three",
    title: "third song", // TODO: real title
    stage: "released",
    date: "2026-08-02", // TODO: real date
    youtube: "https://youtu.be/LgWTL4fmo2U",
    audio: "",
  },
  {
    // The fourth link. Marked unreleased because you said one song was
    // "ready to go" rather than up — if it IS public, change stage to
    // "released". If it's unlisted, decide before deploying: embedding it
    // here makes it findable to anyone who opens the site.
    id: "song-four",
    title: "fourth song", // TODO: real title
    stage: "unreleased",
    date: "2026-09-23", // TODO: real date
    youtube: "https://youtu.be/vdbbU5g6RdM",
    audio: "",
  },
];

export const featuredTracks = tracks.filter((t) => t.featured);

export function sortTracks(list: Track[]): Track[] {
  return [...list].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export const stageLabels: Record<TrackStage, string> = {
  snippet: "Snippet",
  demo: "Demo",
  unreleased: "Unreleased",
  released: "Released",
};
