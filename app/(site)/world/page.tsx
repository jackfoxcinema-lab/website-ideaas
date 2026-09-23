import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { Reveal } from "@/components/common/reveal";
import { SectionHeading } from "@/components/common/section-heading";
import { EntryCard } from "@/components/world/entry-card";
import { siteConfig } from "@/config/site";
import { entryKinds, worldConfig } from "@/config/world";
import { getEntriesByKind } from "@/lib/world";

export const metadata: Metadata = {
  title: "World",
  description: `${worldConfig.tagline} — the ongoing world behind the songs of ${siteConfig.name}.`,
  alternates: { canonical: "/world" },
};

export default function WorldPage() {
  const groups = getEntriesByKind();
  const total = groups.reduce((sum, g) => sum + g.entries.length, 0);

  // Show the kinds in the order config/world.ts lists them, then anything
  // using a kind that isn't in that list, so a typo never hides an entry.
  const known = entryKinds
    .map((kind) => ({
      ...kind,
      entries: groups.find((g) => g.kind === kind.id)?.entries ?? [],
    }))
    .filter((kind) => kind.entries.length > 0);

  const unknown = groups.filter(
    (g) => !entryKinds.some((kind) => kind.id === g.kind)
  );

  return (
    <>
      <PageHeader
        eyebrow={worldConfig.status}
        title={worldConfig.name}
        description={worldConfig.tagline}
      />

      <Reveal className="panel mb-24 px-8 py-12">
        <div className="mx-auto max-w-prose space-y-5 text-[1.05rem] leading-relaxed text-foreground/80">
          {worldConfig.premise
            .trim()
            .split(/\n{2,}/)
            .map((para, i) => (
              <p key={i}>{para}</p>
            ))}
        </div>
      </Reveal>

      {total === 0 ? (
        <p className="py-24 text-center text-sm text-muted-foreground">
          Nothing written down yet.
        </p>
      ) : (
        <div className="flex flex-col gap-24 pb-8">
          {known.map((kind, i) => (
            <Reveal key={kind.id} as="section" delay={Math.min(i * 0.05, 0.2)}>
              <SectionHeading title={kind.label} />
              <p className="-mt-6 mb-8 text-sm text-muted-foreground">
                {kind.blurb}
              </p>
              <div className="flex flex-col">
                {kind.entries.map((entry) => (
                  <EntryCard key={entry.slug} entry={entry} />
                ))}
              </div>
            </Reveal>
          ))}

          {unknown.map((group) => (
            <Reveal key={group.kind} as="section">
              <SectionHeading title={group.kind} />
              <div className="flex flex-col">
                {group.entries.map((entry) => (
                  <EntryCard key={entry.slug} entry={entry} />
                ))}
              </div>
            </Reveal>
          ))}
        </div>
      )}
    </>
  );
}
