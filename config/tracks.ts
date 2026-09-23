export type TrackStage = "snippet" | "demo" | "unreleased" | "released";

export interface Track {
  /** URL-safe id, also used to seed the waveform so it stays stable. */
  id: string;
  title: string;
  stage: TrackStage;
  /** ISO date (YYYY-MM-DD). Used for sorting, newest first. */
  date: string;
  /**
   * Audio file under /public/audio. Drop an mp3/m4a/wav in there and point
   * at it here. Leave as "" and the card renders without a player.
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
 * Add newest first — it sorts by date anyway, so order here doesn't matter.
 * These three are placeholders showing the shape; replace them.
 */
export const tracks: Track[] = [
  {
    id: "kitchen-window",
    title: "kitchen window",
    stage: "snippet",
    date: "2026-09-14",
    audio: "", // -> "/audio/kitchen-window.mp3" once the file is in public/audio
    note: "Recorded in one take on a phone at 2am. The hum is the fridge and it stays in.",
    lyric: "and the light came through the kitchen window / like it had somewhere to be",
    tags: ["voice memo", "guitar", "unfinished"],
    featured: true,
  },
  {
    id: "slow-tide",
    title: "slow tide",
    stage: "demo",
    date: "2026-08-30",
    audio: "", // -> "/audio/slow-tide.mp3" once the file is in public/audio
    note: "Built around a tape loop that kept slipping out of time. Left the slip in.",
    tags: ["tape loop", "synth", "ambient"],
    featured: true,
  },
  {
    id: "no-title-yet",
    title: "no title yet",
    stage: "snippet",
    date: "2026-08-02",
    audio: "",
    note: "Twenty seconds of a chorus I can't finish. Posting it here so I stop hiding it.",
    tags: ["fragment"],
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
