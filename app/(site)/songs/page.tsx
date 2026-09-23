import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { Reveal } from "@/components/common/reveal";
import { TrackCard } from "@/components/music/track-card";
import { siteConfig } from "@/config/site";
import { sortTracks, tracks } from "@/config/tracks";
import { getAllEntries } from "@/lib/world";

export const metadata: Metadata = {
  title: "Songs",
  description: `Every song ${siteConfig.name} has put out, plus the ones still on the way.`,
  alternates: { canonical: "/songs" },
};

export default function SongsPage() {
  const all = sortTracks(tracks);

  // Read the world once and hand each card its own entries, rather than
  // walking content/world per track.
  const entries = getAllEntries();

  return (
    <>
      <PageHeader
        eyebrow={`${all.length} ${all.length === 1 ? "song" : "songs"}`}
        title="Songs"
        description="Everything that's out, and the ones waiting on a video. Each one links to whatever it added to the world."
      />

      {all.length === 0 ? (
        <p className="py-24 text-center text-sm text-muted-foreground">
          Nothing posted yet.
        </p>
      ) : (
        <div className="flex flex-col pb-8">
          {all.map((track, i) => (
            <Reveal key={track.id} delay={Math.min(i * 0.05, 0.3)}>
              <TrackCard
                track={track}
                entries={entries.filter((e) => e.song === track.id)}
              />
            </Reveal>
          ))}
        </div>
      )}
    </>
  );
}
