/**
 * The world — the ongoing project the songs belong to.
 *
 * Everything on /world reads from here plus the markdown files in
 * content/world. This file is the frame; the entries are the contents.
 */

/**
 * What kind of thing an entry is. Add or rename freely — the index groups by
 * whatever is in this list, and an entry whose `kind` isn't here just sorts
 * under "other".
 */
export type EntryKind = "place" | "figure" | "object" | "event" | "fragment";

export const entryKinds: { id: EntryKind; label: string; blurb: string }[] = [
  { id: "place", label: "Places", blurb: "Where it happens." },
  { id: "figure", label: "Figures", blurb: "Who's in it." },
  { id: "object", label: "Objects", blurb: "Things that keep turning up." },
  { id: "event", label: "Events", blurb: "What happened, and when." },
  {
    id: "fragment",
    label: "Fragments",
    blurb: "Loose pieces, not placed yet.",
  },
];

export const worldConfig = {
  /** The world's name. Shown as the page title. */
  name: "the world",

  /**
   * One line under the title. What this place is, in the fewest words that
   * do the job.
   */
  tagline: "the place the first songs come from",

  /**
   * Two or three sentences. Write it in your own voice — this is the first
   * thing anyone reads, and it sets whether the rest lands as lore or as
   * liner notes.
   */
  premise: `Every song so far is set in the same place. This is that place, written down as it turns up — a room at a time, a name at a time.

Nothing here is finished. Entries get added when a song finds them, and older ones get rewritten when a song contradicts them.`,

  /**
   * The honest status line, shown in the header. This is a long project with
   * no deadline; saying so up front is better than an empty "coming soon".
   */
  status: "ongoing — added to as the songs arrive",

  /** Pinned to the home page under the world section. */
  featuredCount: 3,
} as const;

export const entryKindLabels: Record<string, string> = {
  place: "Place",
  figure: "Figure",
  object: "Object",
  event: "Event",
  fragment: "Fragment",
};
