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
 * TODO: replace the three placeholders below with the three songs that are
 * already up on the channel. For each one you need the title, the date it
 * went up, and the YouTube link. Everything else is optional.
 *
 * To tie a song to the world, put its `id` in the `song:` field of a
 * markdown file in content/world — the entries then show up under the song
 * on /songs, and the song shows up on the entry's page.
 */
export const tracks: Track[] = [
  {
    id: "song-one",
    title: "first song",
    stage: "released",
    date: "2026-09-14",
    youtube: "", // -> paste the YouTube link here
    audio: "",
    note: "",
    tags: [],
    featured: true,
  },
  {
    id: "song-two",
    title: "second song",
    stage: "released",
    date: "2026-08-30",
    youtube: "",
    audio: "",
    note: "",
    tags: [],
    featured: true,
  },
  {
    id: "song-three",
    title: "third song",
    stage: "released",
    date: "2026-08-02",
    youtube: "",
    audio: "",
    note: "",
    tags: [],
  },
  {
    // The one that's finished but not up yet. Listing it as `unreleased`
    // with no player is the point — it says the work is still moving
    // without pretending there's something to press play on.
    id: "song-four",
    title: "next one",
    stage: "unreleased",
    date: "2026-09-23",
    youtube: "",
    audio: "",
    note: "Finished. Waiting on the video.",
    tags: [],
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
