import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { Reveal } from "@/components/common/reveal";
import { TrackCard } from "@/components/music/track-card";
import { siteConfig } from "@/config/site";
import { sortTracks, tracks } from "@/config/tracks";

export const metadata: Metadata = {
  title: "Snippets",
  description:
    "Song snippets, demos and voice memos — works in progress from " +
    siteConfig.name +
    ".",
  alternates: { canonical: "/snippets" },
};

export default function SnippetsPage() {
  const all = sortTracks(tracks);

  return (
    <>
      <PageHeader
        eyebrow={`${all.length} ${all.length === 1 ? "piece" : "pieces"}`}
        title="Snippets"
        description="Pieces of songs, mostly unfinished. Tap play, drag the waveform to move around. Newest first."
      />

      {all.length === 0 ? (
        <p className="py-24 text-center text-sm text-muted-foreground">
          Nothing posted yet.
        </p>
      ) : (
        <div className="flex flex-col pb-8">
          {all.map((track, i) => (
            <Reveal key={track.id} delay={Math.min(i * 0.05, 0.3)}>
              <TrackCard track={track} />
            </Reveal>
          ))}
        </div>
      )}
    </>
  );
}
