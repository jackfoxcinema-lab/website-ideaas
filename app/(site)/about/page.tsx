import type { Metadata } from "next";
import Link from "next/link";

import { Icons } from "@/components/common/icons";
import { PageHeader } from "@/components/common/page-header";
import { Reveal } from "@/components/common/reveal";
import { siteConfig } from "@/config/site";
import { socialLinks } from "@/config/socials";

export const metadata: Metadata = {
  title: "About",
  description: `About ${siteConfig.name} — ${siteConfig.description}`,
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <div className="pb-12">
      <PageHeader eyebrow="About" title={siteConfig.name} lowercase={false} />

      {/* Replace this copy with your own. */}
      <Reveal delay={0.1} className="prose-flore">
        <p>
          I write songs, and they all come from the same place. Not a genre — a
          place. The first few are up on YouTube and the next one is finished,
          and somewhere along the way it stopped being a set of tracks and
          started being one thing with a shape.
        </p>
        <p>
          So this site has a <Link href="/world">world</Link> in it. Every room,
          person and object the songs turn up gets written down there as it
          arrives. It is nowhere near finished and there is no date by which it
          will be. That is the project.
        </p>
        <h2>Where to find me</h2>
        <p>
          Songs and videos go up on YouTube first. Everything that explains them
          ends up here.
        </p>
      </Reveal>

      <Reveal delay={0.16} as="section" className="mt-20">
        <h2 className="label mb-2 border-b border-border pb-4">Links</h2>
        <ul className="flex flex-col divide-y divide-border">
          {socialLinks.map((social) => {
            const Icon = Icons[social.icon];
            return (
              <li key={social.href}>
                <a
                  href={social.href}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center gap-4 py-4 transition-colors hover:text-accent"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent" />
                  <span className="font-display text-xl font-medium leading-none">
                    {social.name}
                  </span>
                  <span className="label ml-auto truncate">
                    {social.handle}
                  </span>
                  <Icons.arrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                </a>
              </li>
            );
          })}
        </ul>
      </Reveal>
    </div>
  );
}
