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
    <div className="max-w-3xl pb-12">
      <PageHeader
        eyebrow={`${all.length} ${all.length === 1 ? "piece" : "pieces"}`}
        title="Snippets"
        description="Pieces of songs, mostly unfinished. Tap play, drag the waveform to move around. Newest first."
      />

      {all.length === 0 ? (
        <p className="border-t border-border py-16 text-sm text-muted-foreground">
          Nothing posted yet.
        </p>
      ) : (
        <div className="flex flex-col border-t border-border pt-7">
          {all.map((track, i) => (
            <Reveal key={track.id} delay={Math.min(i * 0.05, 0.3)}>
              <TrackCard track={track} />
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
