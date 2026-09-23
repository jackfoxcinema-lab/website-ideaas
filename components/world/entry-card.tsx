import Image from "next/image";
import Link from "next/link";

import { entryKindLabels } from "@/config/world";
import type { EntryMeta } from "@/lib/world";
import { cn } from "@/lib/utils";

interface EntryCardProps {
  entry: EntryMeta;
  className?: string;
}

/**
 * One thing in the world. Deliberately a row and not a tile — the index
 * should read like a field guide being kept, not a shop.
 */
export function EntryCard({ entry, className }: EntryCardProps) {
  return (
    <Link
      href={`/world/${entry.slug}`}
      className={cn(
        "group flex items-start gap-6 border-b border-border py-8 last:border-b-0",
        className
      )}
    >
      {entry.image && (
        <div className="relative hidden h-20 w-20 shrink-0 overflow-hidden border border-border bg-muted sm:block">
          <Image
            src={entry.image}
            alt=""
            fill
            sizes="80px"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <h3 className="font-display text-2xl font-semibold lowercase leading-tight tracking-[-0.02em] transition-colors group-hover:text-accent sm:text-3xl">
          {entry.title}
        </h3>

        <p className="mt-3 max-w-prose text-[0.95rem] leading-relaxed text-muted-foreground">
          {entry.description}
        </p>

        {entry.tags?.length ? (
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
            {entry.tags.map((tag) => (
              <span key={tag} className="label">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <span className="label hidden shrink-0 pt-1 sm:block">
        {entryKindLabels[entry.kind] ?? entry.kind}
      </span>
    </Link>
  );
}
