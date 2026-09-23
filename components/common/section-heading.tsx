import Link from "next/link";

import { Icons } from "@/components/common/icons";

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  /** Optional "see everything" link on the right. */
  href?: string;
  linkLabel?: string;
}

export function SectionHeading({
  eyebrow,
  title,
  href,
  linkLabel = "All",
}: SectionHeadingProps) {
  return (
    <div className="mb-8 flex items-end justify-between gap-6 border-b border-border pb-4">
      <div>
        <span className="label mb-2 block">{eyebrow}</span>
        <h2 className="font-display text-3xl font-normal leading-none tracking-tight sm:text-4xl">
          {title}
        </h2>
      </div>
      {href && (
        <Link
          href={href}
          className="label inline-flex shrink-0 items-center gap-1 pb-1 text-foreground transition-opacity hover:opacity-60"
        >
          {linkLabel}
          <Icons.arrowUpRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}
